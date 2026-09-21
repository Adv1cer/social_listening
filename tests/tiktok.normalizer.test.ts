import { describe, expect, it } from 'vitest';
import { normalizeTikTokPost } from '../src/collectors/tiktok/tiktok.normalizer.js';
import type { RawTikTokPost } from '../src/collectors/tiktok/tiktok.parser.js';

const base: RawTikTokPost = {
  postId: '7123456789012345678',
  url: 'https://www.tiktok.com/@utccuni/video/7123456789012345678',
  captionText: 'เรียนที่ #UTCC สนุกมาก',
  publishedAtRaw: '2026-09-10T08:00:00.000Z',
  authorUsername: 'utccuni',
  authorDisplayName: 'UTCC Official',
  authorProfileUrl: 'https://www.tiktok.com/@utccuni',
  viewsRaw: '10K',
  likesRaw: '1.2K',
  commentsRaw: '45',
  sharesRaw: '12',
};

describe('normalizeTikTokPost', () => {
  it('maps a fully-populated raw post to CollectedPost', () => {
    const post = normalizeTikTokPost(base, '2026-09-21T00:00:00.000Z');
    expect(post).toEqual({
      platform: 'tiktok',
      platformPostId: '7123456789012345678',
      url: 'https://www.tiktok.com/@utccuni/video/7123456789012345678',
      text: 'เรียนที่ #UTCC สนุกมาก',
      hashtags: ['UTCC'],
      publishedAt: '2026-09-10T08:00:00.000Z',
      author: {
        platformAuthorId: null,
        username: 'utccuni',
        displayName: 'UTCC Official',
        profileUrl: 'https://www.tiktok.com/@utccuni',
        verified: null,
      },
      metrics: { views: 10000, likes: 1200, comments: 45, shares: 12, saves: null },
      collectedAt: '2026-09-21T00:00:00.000Z',
    });
  });

  it('fills missing fields with null rather than fabricating', () => {
    const post = normalizeTikTokPost(
      { ...base, publishedAtRaw: null, authorDisplayName: null, viewsRaw: null },
      '2026-09-21T00:00:00.000Z',
    );
    expect(post?.publishedAt).toBeNull();
    expect(post?.author.displayName).toBeNull();
    expect(post?.metrics.views).toBeNull();
  });

  it('returns null when postId or url is missing (unusable card)', () => {
    expect(normalizeTikTokPost({ ...base, postId: null }, '2026-09-21T00:00:00.000Z')).toBeNull();
    expect(normalizeTikTokPost({ ...base, url: null }, '2026-09-21T00:00:00.000Z')).toBeNull();
  });

  it('defaults username to "unknown" when absent, never fabricating a real name', () => {
    const post = normalizeTikTokPost({ ...base, authorUsername: null }, '2026-09-21T00:00:00.000Z');
    expect(post?.author.username).toBe('unknown');
  });
});
