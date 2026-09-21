import { describe, expect, it, vi } from 'vitest';
import { runCollection } from '../src/services/collection.service.js';
import type { SocialCollector } from '../src/collectors/collector.interface.js';
import type { CollectedPost } from '../src/types/social.types.js';

vi.mock('../src/services/post.service.js', () => ({
  persistCollectedPost: vi.fn(async () => ({ created: true, metricsChanged: true, postRecordId: 'p' })),
}));
vi.mock('../src/repositories/collection-run.repository.js', () => ({
  createCollectionRun: vi.fn(async () => ({ id: 'run-1' })),
  finishCollectionRun: vi.fn(async () => ({})),
  deriveRunStatus: (stopReason: string) => (stopReason === 'blocked' ? 'failed' : 'completed'),
}));

function fakePost(id: string): CollectedPost {
  return {
    platform: 'tiktok',
    platformPostId: id,
    url: `https://www.tiktok.com/@u/video/${id}`,
    text: null,
    hashtags: [],
    publishedAt: null,
    author: { platformAuthorId: null, username: 'u', displayName: null, profileUrl: null, verified: null },
    metrics: { views: null, likes: null, comments: null, shares: null, saves: null },
    collectedAt: '2026-09-21T00:00:00.000Z',
  };
}

describe('runCollection', () => {
  it('sums per-keyword results into the response summary, found can exceed target', async () => {
    const collector: SocialCollector = {
      collect: vi
        .fn()
        .mockResolvedValueOnce({
          posts: Array.from({ length: 34 }, (_, i) => fakePost(`a${i}`)),
          scannedCount: 34,
          returnedCount: 34,
          targetPosts: 30,
          targetReached: true,
          stopReason: 'target_reached',
        })
        .mockResolvedValueOnce({
          posts: Array.from({ length: 33 }, (_, i) => fakePost(`b${i}`)),
          scannedCount: 33,
          returnedCount: 33,
          targetPosts: 30,
          targetReached: true,
          stopReason: 'target_reached',
        }),
    };

    const result = await runCollection({} as never, collector, {
      platform: 'tiktok',
      keywords: ['UTCC', 'มหาวิทยาลัยหอการค้าไทย'],
      targetPostsPerQuery: 30,
      targetTotalPosts: 60,
      maxScrollsPerQuery: 30,
      maxCollectionTimePerQuerySeconds: 120,
      maxConsecutiveEmptyScrolls: 3,
    });

    expect(result.summary.target).toBe(60);
    expect(result.summary.found).toBe(67);
    expect(result.summary.new).toBe(67);
    expect(result.runs).toHaveLength(2);
    expect(result.runs[0]).toMatchObject({ keyword: 'UTCC', returnedPosts: 34, targetReached: true, stopReason: 'target_reached' });
    expect(result.status).toBe('completed');
  });

  it('stops starting new keyword queries once targetTotalPosts is met', async () => {
    const collect = vi
      .fn()
      .mockResolvedValueOnce({
        posts: Array.from({ length: 80 }, (_, i) => fakePost(`a${i}`)),
        scannedCount: 80,
        returnedCount: 80,
        targetPosts: 30,
        targetReached: true,
        stopReason: 'target_reached',
      })
      .mockResolvedValueOnce({
        posts: [],
        scannedCount: 0,
        returnedCount: 0,
        targetPosts: 30,
        targetReached: false,
        stopReason: 'no_more_results',
      });
    const collector: SocialCollector = { collect };

    await runCollection({} as never, collector, {
      platform: 'tiktok',
      keywords: ['a', 'b', 'c'],
      targetPostsPerQuery: 30,
      targetTotalPosts: 60,
      maxScrollsPerQuery: 30,
      maxCollectionTimePerQuerySeconds: 120,
      maxConsecutiveEmptyScrolls: 3,
    });

    expect(collect).toHaveBeenCalledTimes(1);
  });
});
