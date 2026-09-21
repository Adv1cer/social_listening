import { describe, expect, it, vi } from 'vitest';
import { persistCollectedPost } from '../src/services/post.service.js';
import type { CollectedPost } from '../src/types/social.types.js';

vi.mock('../src/repositories/author.repository.js', () => ({
  upsertAuthor: vi.fn(async () => ({ id: 'author-1' })),
}));
vi.mock('../src/repositories/post.repository.js', () => ({
  upsertPost: vi.fn(async () => ({ post: { id: 'post-1' }, created: true })),
}));
vi.mock('../src/repositories/metrics.repository.js', () => ({
  appendMetricSnapshotIfChanged: vi.fn(async () => true),
}));

const post: CollectedPost = {
  platform: 'tiktok',
  platformPostId: '1',
  url: 'https://www.tiktok.com/@u/video/1',
  text: null,
  hashtags: [],
  publishedAt: null,
  author: { platformAuthorId: null, username: 'u', displayName: null, profileUrl: null, verified: null },
  metrics: { views: 10, likes: 1, comments: 0, shares: 0, saves: null },
  collectedAt: '2026-09-21T00:00:00.000Z',
};

describe('persistCollectedPost', () => {
  it('upserts author, upserts post, and records a metric snapshot', async () => {
    const result = await persistCollectedPost({} as never, post);
    expect(result).toEqual({ created: true, metricsChanged: true, postRecordId: 'post-1' });
  });
});
