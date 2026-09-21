import { describe, expect, it } from 'vitest';
import { runCollectionLoop, type BatchLoader, type BatchResult } from '../src/collectors/tiktok/tiktok.collector.js';
import type { CollectorInput } from '../src/collectors/collector.types.js';
import type { CollectedPost } from '../src/types/social.types.js';

function makePosts(ids: string[]): CollectedPost[] {
  return ids.map((id) => ({
    platform: 'tiktok',
    platformPostId: id,
    url: `https://www.tiktok.com/@u/video/${id}`,
    text: null,
    hashtags: [],
    publishedAt: null,
    author: { platformAuthorId: null, username: 'u', displayName: null, profileUrl: null, verified: null },
    metrics: { views: null, likes: null, comments: null, shares: null, saves: null },
    collectedAt: '2026-09-21T00:00:00.000Z',
  }));
}

function scriptedLoader(batches: BatchResult[]): BatchLoader {
  let i = 0;
  return {
    async loadNextBatch() {
      const batch = batches[Math.min(i, batches.length - 1)];
      i += 1;
      return batch;
    },
  };
}

const baseInput: CollectorInput = {
  query: 'UTCC',
  targetPosts: 30,
  maxScrolls: 30,
  maxCollectionTimeSeconds: 120,
  maxConsecutiveEmptyScrolls: 3,
};

describe('runCollectionLoop', () => {
  it('never truncates the batch that crosses the target (12+13+11 -> 36, not 30)', async () => {
    const loader = scriptedLoader([
      { type: 'posts', posts: makePosts(Array.from({ length: 12 }, (_, i) => `p${i}`)) },
      { type: 'posts', posts: makePosts(Array.from({ length: 13 }, (_, i) => `p${12 + i}`)) },
      { type: 'posts', posts: makePosts(Array.from({ length: 11 }, (_, i) => `p${25 + i}`)) },
      { type: 'empty' },
    ]);

    const result = await runCollectionLoop(baseInput, loader);

    expect(result.returnedCount).toBe(36);
    expect(result.posts).toHaveLength(36);
    expect(result.targetReached).toBe(true);
    expect(result.stopReason).toBe('target_reached');
  });

  it('returns fewer than target when TikTok has no more results, without fabricating', async () => {
    const loader = scriptedLoader([
      { type: 'posts', posts: makePosts(Array.from({ length: 47 }, (_, i) => `p${i}`)) },
      { type: 'empty' },
    ]);

    const result = await runCollectionLoop({ ...baseInput, targetPosts: 100 }, loader);

    expect(result.returnedCount).toBe(47);
    expect(result.targetReached).toBe(false);
    expect(result.stopReason).toBe('no_more_results');
  });

  it('stops on repeated duplicate-only batches via empty-scroll limit', async () => {
    const dupBatch = makePosts(['dup1', 'dup2']);
    const loader = scriptedLoader([
      { type: 'posts', posts: dupBatch },
      { type: 'posts', posts: dupBatch },
      { type: 'posts', posts: dupBatch },
      { type: 'posts', posts: dupBatch },
    ]);

    const result = await runCollectionLoop({ ...baseInput, maxConsecutiveEmptyScrolls: 3 }, loader);

    expect(result.returnedCount).toBe(2);
    expect(result.stopReason).toBe('empty_scroll_limit');
  });

  it('stops at the scroll limit if target is never reached', async () => {
    let calls = 0;
    const loader: BatchLoader = {
      async loadNextBatch() {
        calls += 1;
        return { type: 'posts', posts: makePosts([`unique-${calls}`]) };
      },
    };

    const result = await runCollectionLoop({ ...baseInput, targetPosts: 1000, maxScrolls: 5 }, loader);

    expect(calls).toBe(5);
    expect(result.stopReason).toBe('scroll_limit');
  });

  it('stops immediately and reports blocked, never bypassing', async () => {
    const loader = scriptedLoader([{ type: 'blocked', reason: 'captcha' }]);

    const result = await runCollectionLoop(baseInput, loader);

    expect(result.stopReason).toBe('blocked');
    expect(result.posts).toHaveLength(0);
  });

  it('stops on timeout when the loader is slower than the configured budget', async () => {
    const loader: BatchLoader = {
      async loadNextBatch() {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return { type: 'posts', posts: makePosts(['p1']) };
      },
    };

    const result = await runCollectionLoop(
      { ...baseInput, targetPosts: 1000, maxScrolls: 1000, maxCollectionTimeSeconds: 0.02 },
      loader,
    );

    expect(result.stopReason).toBe('timeout');
  });
});
