import { describe, expect, it } from 'vitest';
import {
  extractVideoDetailItem,
  normalizeVideoDetailToPost,
} from '../src/collectors/tiktok/tiktok.video-detail.js';

const ITEM = {
  id: '7685345255792692501',
  desc: '#EVENTUTCC #DEK70 เรียนที่ UTCC สนุกมาก',
  createTime: '1789383887',
  author: { id: 'author-id-1', uniqueId: 'eventutcc', nickname: 'Event UTCC', verified: false },
  stats: { diggCount: 430, shareCount: 206, commentCount: 3, playCount: 5064, collectCount: '28' },
  music: { id: 'music-1', title: 'original sound' },
  video: { id: 'video-1', duration: 100 },
  locationCreated: 'TH',
};

function htmlWithUniversalData(item: unknown): string {
  const payload = JSON.stringify({
    __DEFAULT_SCOPE__: {
      'webapp.video-detail': { itemInfo: { itemStruct: item }, statusCode: 0, statusMsg: '', shareMeta: {} },
    },
  });
  return `<html><body><script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${payload}</script></body></html>`;
}

describe('extractVideoDetailItem', () => {
  it('extracts the itemStruct from a real-shaped __UNIVERSAL_DATA_FOR_REHYDRATION__ payload', () => {
    const item = extractVideoDetailItem(htmlWithUniversalData(ITEM));
    expect(item?.id).toBe('7685345255792692501');
    expect(item?.author?.uniqueId).toBe('eventutcc');
  });

  it('returns null when the script tag is absent (e.g. blocked/skeleton page)', () => {
    expect(extractVideoDetailItem('<html><body>no data here</body></html>')).toBeNull();
  });

  it('returns null on malformed JSON rather than throwing', () => {
    const html =
      '<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">{not json</script>';
    expect(extractVideoDetailItem(html)).toBeNull();
  });
});

describe('normalizeVideoDetailToPost', () => {
  it('maps Apify-equivalent fields from a real video-detail item', () => {
    const item = extractVideoDetailItem(htmlWithUniversalData(ITEM))!;
    const post = normalizeVideoDetailToPost(
      item,
      'https://www.tiktok.com/@eventutcc/video/7685345255792692501',
      '2026-09-21T00:00:00.000Z',
      'profile',
      'eventutcc',
    );

    expect(post?.platformPostId).toBe('7685345255792692501');
    expect(post?.url).toBe('https://www.tiktok.com/@eventutcc/video/7685345255792692501');
    expect(post?.hashtags).toEqual(['EVENTUTCC', 'DEK70']);
    expect(post?.publishedAt).toBe(new Date(1789383887 * 1000).toISOString());
    expect(post?.author).toEqual({
      platformAuthorId: 'author-id-1',
      username: 'eventutcc',
      displayName: 'Event UTCC',
      profileUrl: 'https://www.tiktok.com/@eventutcc',
      verified: false,
    });
    expect(post?.metrics).toEqual({ views: 5064, likes: 430, comments: 3, shares: 206, saves: 28 });
    expect(post?.collectionSource).toBe('profile');
    expect(post?.collectionQuery).toBe('eventutcc');
    expect(post?.raw?.musicMeta).toEqual(ITEM.music);
    expect(post?.raw?.videoMeta).toEqual(ITEM.video);
    expect(post?.raw?.locationMeta).toBe('TH');
  });

  it('returns null when the item has no id (nothing usable to persist)', () => {
    const post = normalizeVideoDetailToPost({ id: '' }, 'https://example.com', 'now', 'direct_url', null);
    expect(post).toBeNull();
  });
});
