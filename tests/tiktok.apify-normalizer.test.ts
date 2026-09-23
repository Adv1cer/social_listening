import { describe, expect, it } from 'vitest';
import { normalizeApifyTikTokItem, type ApifyTikTokItem } from '../src/collectors/tiktok/tiktok.apify-normalizer.js';

const ITEM: ApifyTikTokItem = {
  id: '7685345255792692501',
  text: 'เรียนที่ UTCC สนุกมาก #EVENTUTCC #DEK70',
  createTime: 1789383887,
  createTimeISO: '2026-09-13T10:04:47.000Z',
  webVideoUrl: 'https://www.tiktok.com/@eventutcc/video/7685345255792692501',
  diggCount: 430,
  shareCount: 206,
  playCount: 5064,
  commentCount: 3,
  collectCount: 28,
  hashtags: [{ id: 'h1', name: 'EVENTUTCC' }, { id: 'h2', name: 'DEK70' }],
  authorMeta: { id: 'author-id-1', name: 'eventutcc', nickName: 'Event UTCC', verified: false },
  musicMeta: { musicId: 'music-1' },
  videoMeta: { duration: 100 },
  locationMeta: { country: 'TH' },
};

describe('normalizeApifyTikTokItem', () => {
  it('maps an Apify dataset item to a CollectedPost with Apify-equivalent raw metadata', () => {
    const post = normalizeApifyTikTokItem(ITEM, '2026-09-22T00:00:00.000Z', 'hashtag', 'utcc');

    expect(post?.platformPostId).toBe('7685345255792692501');
    expect(post?.url).toBe('https://www.tiktok.com/@eventutcc/video/7685345255792692501');
    expect(post?.hashtags).toEqual(['EVENTUTCC', 'DEK70']);
    expect(post?.publishedAt).toBe('2026-09-13T10:04:47.000Z');
    expect(post?.author).toEqual({
      platformAuthorId: 'author-id-1',
      username: 'eventutcc',
      displayName: 'Event UTCC',
      profileUrl: 'https://www.tiktok.com/@eventutcc',
      verified: false,
    });
    expect(post?.metrics).toEqual({ views: 5064, likes: 430, comments: 3, shares: 206, saves: 28 });
    expect(post?.collectionSource).toBe('hashtag');
    expect(post?.collectionQuery).toBe('utcc');
    expect(post?.raw?.musicMeta).toEqual(ITEM.musicMeta);
    expect(post?.raw?.locationMeta).toEqual(ITEM.locationMeta);
  });

  it('returns null when the item has neither id nor any usable url', () => {
    expect(normalizeApifyTikTokItem({}, 'now', 'hashtag', 'utcc')).toBeNull();
    expect(normalizeApifyTikTokItem({ id: '123' }, 'now', 'hashtag', 'utcc')).toBeNull();
  });

  it('falls back to constructing the url from author + id when webVideoUrl is absent', () => {
    const post = normalizeApifyTikTokItem(
      { id: '123', authorMeta: { name: 'someone' } },
      'now',
      'hashtag',
      'utcc',
    );
    expect(post?.url).toBe('https://www.tiktok.com/@someone/video/123');
  });
});
