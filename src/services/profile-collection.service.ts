import type { PrismaClient } from '@prisma/client';
import { chromium, type BrowserContext } from 'playwright';
import { launchTikTokContext } from '../collectors/tiktok/tiktok.browser.js';
import { ProfileDiscovery } from '../collectors/tiktok/tiktok.profile-discovery.js';
import { DirectVideoEnricher } from '../collectors/tiktok/tiktok.video-enricher.js';
import { persistCollectedPost } from './post.service.js';
import { createCollectionRun, finishCollectionRun } from '../repositories/collection-run.repository.js';
import { AppError } from '../utils/errors.js';

export interface ProfileCollectionOptions {
  headless?: boolean;
  // When set, uses the stealth + logged-in persistent context. Without it,
  // profile grids are withheld by TikTok (see tiktok.browser.ts).
  profileDir?: string;
}

async function openContext(options: ProfileCollectionOptions): Promise<{ context: BrowserContext; close: () => Promise<void> }> {
  const headless = options.headless ?? true;
  if (options.profileDir) {
    const context = await launchTikTokContext({ headless, profileDir: options.profileDir });
    return { context, close: () => context.close() };
  }
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext();
  return { context, close: () => browser.close() };
}

export interface CollectFromProfilesInput {
  usernames: string[];
  targetPostsPerProfile: number;
  maxScrollsPerProfile: number;
}

export interface ProfileRunSummary {
  runId: string;
  username: string;
  videosDiscovered: number;
  postsEnriched: number;
  newCount: number;
  updatedCount: number;
  failedCount: number;
  stopReason: string;
  errorCode?: string;
}

export interface CollectDirectUrlsInput {
  urls: string[];
}

export interface DirectUrlRunSummary {
  runId: string;
  url: string;
  status: 'enriched' | 'blocked' | 'unavailable' | 'error';
  postId: string | null;
}

// No pre-existing "UTCC scope guard" was found elsewhere in this codebase.
// This is the closest equivalent: an allowlist gate on which profiles may be
// collected. An empty allowlist (no TIKTOK_UTCC_PROFILES configured) does not
// block requests — there's nothing to guard against yet.
export function assertProfileInScope(username: string, allowlist: string[]): void {
  if (allowlist.length === 0) return;
  if (!allowlist.includes(username)) {
    throw new AppError(403, 'PROFILE_OUT_OF_SCOPE', `Profile "${username}" is not in the configured UTCC profile scope`);
  }
}

export async function collectFromProfiles(
  prisma: PrismaClient,
  input: CollectFromProfilesInput,
  allowlist: string[],
  options: ProfileCollectionOptions = {},
): Promise<ProfileRunSummary[]> {
  for (const username of input.usernames) assertProfileInScope(username, allowlist);

  const { context, close } = await openContext(options);
  const results: ProfileRunSummary[] = [];

  try {
    for (const username of input.usernames) {
      const runRecord = await createCollectionRun(prisma, {
        platform: 'tiktok',
        queryType: 'profile',
        queryValue: username,
        targetPosts: input.targetPostsPerProfile,
      });

      let videosDiscovered = 0;
      let postsEnriched = 0;
      let newCount = 0;
      let updatedCount = 0;
      let failedCount = 0;
      let stopReason = 'no_more_results';
      let errorCode: string | undefined;

      try {
        const discoveryPage = await context.newPage();
        const discovery = new ProfileDiscovery(discoveryPage);
        const discoveryResult = await discovery.discover(username, {
          targetVideos: input.targetPostsPerProfile,
          maxScrolls: input.maxScrollsPerProfile,
        });
        await discoveryPage.close();

        if (discoveryResult.status === 'blocked' || discoveryResult.status === 'not_rendered') {
          stopReason = 'blocked';
          errorCode = discoveryResult.reason;
        } else {
          videosDiscovered = discoveryResult.videoUrls.length;
          stopReason = videosDiscovered >= input.targetPostsPerProfile ? 'target_reached' : 'no_more_results';

          const enrichPage = await context.newPage();
          const enricher = new DirectVideoEnricher(enrichPage);
          for (const videoUrl of discoveryResult.videoUrls) {
            const enriched = await enricher.enrich(videoUrl, 'profile', username);
            if (enriched.type === 'post') {
              postsEnriched += 1;
              try {
                const persisted = await persistCollectedPost(prisma, enriched.post);
                if (persisted.created) newCount += 1;
                else updatedCount += 1;
              } catch {
                failedCount += 1;
              }
            } else {
              failedCount += 1;
            }
          }
          await enrichPage.close();
        }

        await finishCollectionRun(prisma, runRecord.id, {
          scannedCount: videosDiscovered,
          foundCount: postsEnriched,
          newCount,
          updatedCount,
          failedCount,
          stopReason: stopReason as 'target_reached' | 'no_more_results' | 'blocked',
          status: stopReason === 'blocked' ? 'failed' : 'completed',
          errorCode,
        });
      } catch (error) {
        stopReason = 'error';
        await finishCollectionRun(prisma, runRecord.id, {
          scannedCount: videosDiscovered,
          foundCount: postsEnriched,
          newCount,
          updatedCount,
          failedCount,
          stopReason: 'error',
          status: 'failed',
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      }

      results.push({ runId: runRecord.id, username, videosDiscovered, postsEnriched, newCount, updatedCount, failedCount, stopReason, errorCode });
    }
  } finally {
    await close();
  }

  return results;
}

export async function collectDirectUrls(
  prisma: PrismaClient,
  input: CollectDirectUrlsInput,
  options: ProfileCollectionOptions = {},
): Promise<DirectUrlRunSummary[]> {
  const { context, close } = await openContext(options);
  const results: DirectUrlRunSummary[] = [];

  try {
    const page = await context.newPage();
    const enricher = new DirectVideoEnricher(page);

    for (const url of input.urls) {
      const runRecord = await createCollectionRun(prisma, {
        platform: 'tiktok',
        queryType: 'direct_url',
        queryValue: url,
        targetPosts: 1,
      });

      const enriched = await enricher.enrich(url, 'direct_url', null);

      if (enriched.type === 'post') {
        try {
          const persisted = await persistCollectedPost(prisma, enriched.post);
          await finishCollectionRun(prisma, runRecord.id, {
            scannedCount: 1,
            foundCount: 1,
            newCount: persisted.created ? 1 : 0,
            updatedCount: persisted.created ? 0 : 1,
            failedCount: 0,
            stopReason: 'target_reached',
            status: 'completed',
          });
          results.push({ runId: runRecord.id, url, status: 'enriched', postId: persisted.postRecordId });
        } catch (error) {
          await finishCollectionRun(prisma, runRecord.id, {
            scannedCount: 1,
            foundCount: 1,
            newCount: 0,
            updatedCount: 0,
            failedCount: 1,
            stopReason: 'error',
            status: 'failed',
            errorMessage: error instanceof Error ? error.message : String(error),
          });
          results.push({ runId: runRecord.id, url, status: 'error', postId: null });
        }
      } else {
        await finishCollectionRun(prisma, runRecord.id, {
          scannedCount: 1,
          foundCount: 0,
          newCount: 0,
          updatedCount: 0,
          failedCount: 1,
          stopReason: enriched.type === 'blocked' ? 'blocked' : 'no_more_results',
          status: enriched.type === 'blocked' ? 'failed' : 'completed',
          errorCode: enriched.type === 'blocked' ? enriched.reason : undefined,
        });
        results.push({ runId: runRecord.id, url, status: enriched.type, postId: null });
      }
    }

    await page.close();
  } finally {
    await close();
  }

  return results;
}
