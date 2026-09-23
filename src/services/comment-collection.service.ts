import type { PrismaClient } from '@prisma/client';
import { hasTikTokSession, launchTikTokContext } from '../collectors/tiktok/tiktok.browser.js';
import {
  PlaywrightCommentDriver,
  isCommentCollectionComplete,
  runCommentLoop,
  type CommentStopReason,
} from '../collectors/tiktok/tiktok.comment-collector.js';
import { upsertComment } from '../repositories/comment.repository.js';
import { createCollectionRun, finishCollectionRun } from '../repositories/collection-run.repository.js';
import { assertProfileInScope } from './profile-collection.service.js';

export interface CommentCollectionOptions {
  headless: boolean;
  profileDir: string;
  requireLogin?: boolean;
  minDelayMs?: number;
  maxDelayMs?: number;
}

export interface CollectCommentsInput {
  usernames: string[];
  since: Date;
  maxCommentsPerVideo: number;
}

export interface VideoCommentSummary {
  url: string;
  collected: number;
  reportedTotal: number | null;
  stopReason: CommentStopReason;
  complete: boolean;
}

export interface CommentRunSummary {
  runId: string;
  username: string;
  videos: VideoCommentSummary[];
  newCount: number;
  updatedCount: number;
  stopReason: string;
  status: 'completed' | 'partial' | 'failed';
}

// Run-level status: any CAPTCHA/session problem fails the run; any video that
// did not plausibly collect all its comments makes it partial. A report must
// never read "no complaints" off a run that silently missed data.
export function deriveCommentRunStatus(videos: VideoCommentSummary[], aborted: string | null) {
  if (aborted) return 'failed' as const;
  return videos.every((v) => v.complete) ? ('completed' as const) : ('partial' as const);
}

export { hasTikTokSession };

export async function collectCommentsForProfiles(
  prisma: PrismaClient,
  input: CollectCommentsInput,
  allowlist: string[],
  options: CommentCollectionOptions,
): Promise<CommentRunSummary[]> {
  for (const username of input.usernames) assertProfileInScope(username, allowlist);
  const minDelay = options.minDelayMs ?? 8000;
  const maxDelay = options.maxDelayMs ?? 20000;

  const context = await launchTikTokContext(options);
  const results: CommentRunSummary[] = [];
  try {
    const loggedIn = await hasTikTokSession(context);

    for (const username of input.usernames) {
      const posts = await prisma.socialPost.findMany({
        where: { platform: 'tiktok', author: { username }, publishedAt: { gte: input.since } },
        select: { id: true, url: true },
        orderBy: { publishedAt: 'desc' },
      });
      const run = await createCollectionRun(prisma, {
        platform: 'tiktok',
        queryType: 'profile_comments',
        queryValue: username,
        targetPosts: posts.length,
      });

      if (posts.length === 0) {
        // Nothing to collect is a failure, not a clean "no comments" result:
        // a report built on this run would otherwise read as "no complaints".
        await finishCollectionRun(prisma, run.id, {
          scannedCount: 0,
          foundCount: 0,
          newCount: 0,
          updatedCount: 0,
          failedCount: 0,
          stopReason: 'error',
          status: 'failed',
          errorCode: 'no_target_videos',
          errorMessage: `No tiktok posts for @${username} with publishedAt >= ${input.since.toISOString()}`,
        });
        results.push({ runId: run.id, username, videos: [], newCount: 0, updatedCount: 0, stopReason: 'no_target_videos', status: 'failed' });
        continue;
      }

      const videos: VideoCommentSummary[] = [];
      let newCount = 0;
      let updatedCount = 0;
      let aborted: string | null = options.requireLogin !== false && !loggedIn ? 'session_expired' : null;

      try {
        const page = await context.newPage();
        const driver = new PlaywrightCommentDriver(page);
        for (const post of aborted ? [] : posts) {
          const result = await runCommentLoop(driver, post.url, {
            maxComments: input.maxCommentsPerVideo,
            maxEmptyWaits: 3,
          });
          for (const c of result.comments) {
            const r = await upsertComment(prisma, post.id, c, 'tiktok_web');
            if (r.created) newCount += 1;
            else updatedCount += 1;
          }
          videos.push({
            url: post.url,
            collected: result.comments.length,
            reportedTotal: result.reportedTotal,
            stopReason: result.stopReason,
            complete: isCommentCollectionComplete(result),
          });
          if (result.stopReason === 'captcha') {
            // Stop hammering once challenged; remaining videos stay uncollected.
            aborted = 'captcha';
            break;
          }
          await page.waitForTimeout(minDelay + Math.floor(Math.random() * (maxDelay - minDelay)));
        }
        await page.close();

        const status = deriveCommentRunStatus(videos, aborted);
        const stopReason = aborted ?? (status === 'completed' ? 'no_more_results' : 'incomplete');
        await finishCollectionRun(prisma, run.id, {
          scannedCount: videos.length,
          foundCount: videos.reduce((n, v) => n + v.collected, 0),
          newCount,
          updatedCount,
          failedCount: videos.filter((v) => !v.complete).length + (posts.length - videos.length),
          stopReason: stopReason as 'captcha' | 'session_expired' | 'no_more_results' | 'incomplete',
          status,
          errorCode: aborted,
        });
        results.push({ runId: run.id, username, videos, newCount, updatedCount, stopReason, status });
      } catch (error) {
        await finishCollectionRun(prisma, run.id, {
          scannedCount: videos.length,
          foundCount: videos.reduce((n, v) => n + v.collected, 0),
          newCount,
          updatedCount,
          failedCount: posts.length - videos.filter((v) => v.complete).length,
          stopReason: 'error',
          status: 'failed',
          errorMessage: error instanceof Error ? error.message : String(error),
        });
        results.push({ runId: run.id, username, videos, newCount, updatedCount, stopReason: 'error', status: 'failed' });
      }
      if (aborted === 'captcha' || aborted === 'session_expired') break;
    }
  } finally {
    await context.close();
  }
  return results;
}
