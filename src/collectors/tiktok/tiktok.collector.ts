import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { PlaywrightCrawler } from 'crawlee';
import type { SocialCollector } from '../collector.interface.js';
import type { CollectorInput, CollectorResult, StopReason } from '../collector.types.js';
import type { CollectedPost } from '../../types/social.types.js';
import { InCollectionDeduper } from '../../services/dedup.service.js';
import { CollectorBlockedError } from '../../utils/errors.js';
import { nowIso } from '../../utils/date.js';
import { logger } from '../../utils/logger.js';
import { classifyPageState } from './tiktok.block-detector.js';
import { parseSearchResultsHtml } from './tiktok.parser.js';
import { normalizeTikTokPost } from './tiktok.normalizer.js';
import { buildTikTokSearchUrl } from './tiktok.urls.js';

export type BatchResult =
  | { type: 'posts'; posts: CollectedPost[] }
  | { type: 'empty' }
  | { type: 'blocked'; reason: string }
  | { type: 'error'; message: string };

export interface BatchLoader {
  loadNextBatch(): Promise<BatchResult>;
}

export async function runCollectionLoop(input: CollectorInput, loader: BatchLoader): Promise<CollectorResult> {
  const deduper = new InCollectionDeduper();
  const collected: CollectedPost[] = [];
  let scannedCount = 0;
  let consecutiveEmptyScrolls = 0;
  let scrollCount = 0;
  const deadline = Date.now() + input.maxCollectionTimeSeconds * 1000;

  let stopReason: StopReason = 'no_more_results';

  while (true) {
    if (collected.length >= input.targetPosts) {
      stopReason = 'target_reached';
      break;
    }
    if (scrollCount >= input.maxScrolls) {
      stopReason = 'scroll_limit';
      break;
    }
    if (Date.now() >= deadline) {
      stopReason = 'timeout';
      break;
    }

    const batch = await loader.loadNextBatch();
    scrollCount += 1;

    if (batch.type === 'blocked') {
      stopReason = 'blocked';
      break;
    }
    if (batch.type === 'error') {
      logger.warn({ message: batch.message }, 'tiktok collector batch error');
      stopReason = 'error';
      break;
    }
    if (batch.type === 'empty') {
      stopReason = 'no_more_results';
      break;
    }

    scannedCount += batch.posts.length;
    const uniquePosts = batch.posts.filter((post) => !deduper.isDuplicate(post));

    if (uniquePosts.length === 0) {
      consecutiveEmptyScrolls += 1;
      if (consecutiveEmptyScrolls >= input.maxConsecutiveEmptyScrolls) {
        stopReason = 'empty_scroll_limit';
        break;
      }
      continue;
    }

    consecutiveEmptyScrolls = 0;
    collected.push(...uniquePosts);
  }

  return {
    posts: collected,
    scannedCount,
    returnedCount: collected.length,
    targetPosts: input.targetPosts,
    targetReached: collected.length >= input.targetPosts,
    stopReason,
  };
}

export interface TikTokCollectorOptions {
  headless?: boolean;
  saveDebug?: boolean;
  channel?: string;
}

export class TikTokCollector implements SocialCollector {
  constructor(private readonly options: TikTokCollectorOptions = {}) {}

  async collect(input: CollectorInput): Promise<CollectorResult> {
    const pendingBatches: BatchResult[] = [];
    let finished = false;
    let lastBlockReason: string | null = null;
    const { headless = true, saveDebug = false, channel } = this.options;

    const crawler = new PlaywrightCrawler({
      headless,
      launchContext: channel ? { launchOptions: { channel } } : undefined,
      maxConcurrency: 1,
      maxRequestRetries: 2,
      navigationTimeoutSecs: 30,
      requestHandlerTimeoutSecs: 150,
      maxRequestsPerMinute: 10,
      requestHandler: async ({ page }) => {
        const html = await page.content();
        const state = classifyPageState(html, page.url());

        if (state.status !== 'ok') {
          const reason = state.status.toUpperCase();
          lastBlockReason = reason;
          logger.warn({ reason, evidence: state.evidence, url: page.url() }, 'tiktok collector blocked');
          if (saveDebug) {
            await saveDebugArtifacts(page, input.query, reason);
          }
          pendingBatches.push({ type: 'blocked', reason });
          finished = true;
          return;
        }

        const raw = parseSearchResultsHtml(html);
        if (raw.length === 0) {
          if (saveDebug) {
            await saveDebugArtifacts(page, input.query, 'EMPTY_RESULTS');
          }
          pendingBatches.push({ type: 'empty' });
          finished = true;
          return;
        }

        const posts = raw
          .map((r) => normalizeTikTokPost(r, nowIso()))
          .filter((p): p is CollectedPost => p !== null);
        pendingBatches.push({ type: 'posts', posts });

        await page.mouse.wheel(0, 2000);
        await page.waitForTimeout(1000);
      },
      failedRequestHandler: async ({ request, error }) => {
        pendingBatches.push({ type: 'error', message: `${request.url}: ${String(error)}` });
        finished = true;
      },
    });

    const loader: BatchLoader = {
      async loadNextBatch() {
        if (pendingBatches.length === 0 && !finished) {
          await crawler.run([buildTikTokSearchUrl(input.query)]);
        }
        return pendingBatches.shift() ?? { type: 'empty' };
      },
    };

    try {
      const result = await runCollectionLoop(input, loader);
      if (result.stopReason === 'blocked') {
        throw new CollectorBlockedError(lastBlockReason ?? 'UNKNOWN_BLOCK');
      }
      return result;
    } finally {
      await crawler.teardown().catch(() => undefined);
    }
  }
}

async function saveDebugArtifacts(
  page: { screenshot: (opts: { path: string }) => Promise<unknown>; url: () => string },
  query: string,
  reason: string,
): Promise<void> {
  try {
    const dir = join(process.cwd(), 'debug');
    mkdirSync(dir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeQuery = query.replace(/[^a-zA-Z0-9_-]/g, '_');
    const path = join(dir, `tiktok-${safeQuery}-${reason}-${timestamp}.png`);
    await page.screenshot({ path });
    logger.info({ path, reason, url: page.url() }, 'saved debug screenshot');
  } catch (error) {
    logger.warn({ error: String(error) }, 'failed to save debug screenshot');
  }
}
