import type { PrismaClient } from '@prisma/client';
import type { SocialCollector } from '../collectors/collector.interface.js';
import { persistCollectedPost } from './post.service.js';
import { createCollectionRun, finishCollectionRun, deriveRunStatus } from '../repositories/collection-run.repository.js';
import { CollectorBlockedError } from '../utils/errors.js';

export interface RunCollectionInput {
  platform: 'tiktok';
  keywords: string[];
  targetPostsPerQuery: number;
  targetTotalPosts?: number;
  maxScrollsPerQuery: number;
  maxCollectionTimePerQuerySeconds: number;
  maxConsecutiveEmptyScrolls: number;
}

export interface RunSummaryEntry {
  runId: string;
  keyword: string;
  targetPosts: number;
  returnedPosts: number;
  targetReached: boolean;
  stopReason: string;
}

export interface RunCollectionSummary {
  status: 'completed' | 'partial' | 'failed';
  summary: { target: number; found: number; new: number; updated: number; failed: number };
  runs: RunSummaryEntry[];
}

export async function runCollection(
  prisma: PrismaClient,
  collector: SocialCollector,
  input: RunCollectionInput,
): Promise<RunCollectionSummary> {
  const runs: RunSummaryEntry[] = [];
  let found = 0;
  let newCount = 0;
  let updated = 0;
  let failed = 0;
  let anyFailed = false;

  for (const keyword of input.keywords) {
    if (input.targetTotalPosts !== undefined && found >= input.targetTotalPosts) {
      break;
    }

    const runRecord = await createCollectionRun(prisma, {
      platform: input.platform,
      queryType: 'keyword',
      queryValue: keyword,
      targetPosts: input.targetPostsPerQuery,
    });

    try {
      const result = await collector.collect({
        query: keyword,
        targetPosts: input.targetPostsPerQuery,
        maxScrolls: input.maxScrollsPerQuery,
        maxCollectionTimeSeconds: input.maxCollectionTimePerQuerySeconds,
        maxConsecutiveEmptyScrolls: input.maxConsecutiveEmptyScrolls,
      });

      let runNew = 0;
      let runUpdated = 0;
      let runFailed = 0;
      for (const post of result.posts) {
        try {
          const persisted = await persistCollectedPost(prisma, post);
          if (persisted.created) runNew += 1;
          else runUpdated += 1;
        } catch {
          runFailed += 1;
        }
      }

      const status = deriveRunStatus(result.stopReason, null);
      await finishCollectionRun(prisma, runRecord.id, {
        scannedCount: result.scannedCount,
        foundCount: result.returnedCount,
        newCount: runNew,
        updatedCount: runUpdated,
        failedCount: runFailed,
        stopReason: result.stopReason,
        status,
      });

      found += result.returnedCount;
      newCount += runNew;
      updated += runUpdated;
      failed += runFailed;

      runs.push({
        runId: runRecord.id,
        keyword,
        targetPosts: input.targetPostsPerQuery,
        returnedPosts: result.returnedCount,
        targetReached: result.targetReached,
        stopReason: result.stopReason,
      });
    } catch (error) {
      anyFailed = true;
      const blocked = error instanceof CollectorBlockedError;
      await finishCollectionRun(prisma, runRecord.id, {
        scannedCount: 0,
        foundCount: 0,
        newCount: 0,
        updatedCount: 0,
        failedCount: 0,
        stopReason: blocked ? 'blocked' : 'error',
        status: 'failed',
        errorCode: blocked ? (error as CollectorBlockedError).reason : 'COLLECTOR_ERROR',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      runs.push({
        runId: runRecord.id,
        keyword,
        targetPosts: input.targetPostsPerQuery,
        returnedPosts: 0,
        targetReached: false,
        stopReason: blocked ? 'blocked' : 'error',
      });
    }
  }

  return {
    status: anyFailed ? (found > 0 ? 'partial' : 'failed') : 'completed',
    summary: {
      target: input.targetTotalPosts ?? input.targetPostsPerQuery * input.keywords.length,
      found,
      new: newCount,
      updated,
      failed,
    },
    runs,
  };
}
