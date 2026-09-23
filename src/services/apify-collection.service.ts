import type { PrismaClient } from '@prisma/client';
import { runApifyActorForDatasetItems, ApifyRunError } from '../collectors/tiktok/tiktok.apify-client.js';
import { normalizeApifyTikTokItem, type ApifyTikTokItem } from '../collectors/tiktok/tiktok.apify-normalizer.js';
import { persistCollectedPost } from './post.service.js';
import { createCollectionRun, finishCollectionRun } from '../repositories/collection-run.repository.js';
import { nowIso } from '../utils/date.js';

export interface ApifyCollectionOptions {
  token: string;
  actorId: string;
}

export interface CollectFromHashtagsInput {
  hashtags: string[];
  resultsPerPage: number;
}

export interface HashtagRunSummary {
  runId: string;
  hashtag: string;
  fetched: number;
  newCount: number;
  updatedCount: number;
  failedCount: number;
  stopReason: string;
  errorMessage?: string;
}

export async function collectFromHashtagsViaApify(
  prisma: PrismaClient,
  input: CollectFromHashtagsInput,
  options: ApifyCollectionOptions,
): Promise<HashtagRunSummary[]> {
  const results: HashtagRunSummary[] = [];

  for (const hashtag of input.hashtags) {
    const runRecord = await createCollectionRun(prisma, {
      platform: 'tiktok',
      queryType: 'hashtag',
      queryValue: hashtag,
      targetPosts: input.resultsPerPage,
    });

    let newCount = 0;
    let updatedCount = 0;
    let failedCount = 0;
    let fetched = 0;

    try {
      const items = await runApifyActorForDatasetItems<ApifyTikTokItem>({
        token: options.token,
        actorId: options.actorId,
        input: { hashtags: [hashtag], resultsPerPage: input.resultsPerPage },
      });
      fetched = items.length;

      for (const item of items) {
        const post = normalizeApifyTikTokItem(item, nowIso(), 'hashtag', hashtag);
        if (!post) {
          failedCount += 1;
          continue;
        }
        try {
          const persisted = await persistCollectedPost(prisma, post);
          if (persisted.created) newCount += 1;
          else updatedCount += 1;
        } catch {
          failedCount += 1;
        }
      }

      await finishCollectionRun(prisma, runRecord.id, {
        scannedCount: fetched,
        foundCount: fetched,
        newCount,
        updatedCount,
        failedCount,
        stopReason: fetched > 0 ? 'target_reached' : 'no_more_results',
        status: 'completed',
      });
      results.push({ runId: runRecord.id, hashtag, fetched, newCount, updatedCount, failedCount, stopReason: fetched > 0 ? 'target_reached' : 'no_more_results' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const errorCode = error instanceof ApifyRunError ? String(error.statusCode) : 'APIFY_ERROR';
      await finishCollectionRun(prisma, runRecord.id, {
        scannedCount: 0,
        foundCount: 0,
        newCount: 0,
        updatedCount: 0,
        failedCount: 0,
        stopReason: 'error',
        status: 'failed',
        errorCode,
        errorMessage: message,
      });
      results.push({ runId: runRecord.id, hashtag, fetched: 0, newCount: 0, updatedCount: 0, failedCount: 0, stopReason: 'error', errorMessage: message });
    }
  }

  return results;
}
