import { describe, expect, it } from 'vitest';
import { InCollectionDeduper, canonicalizeUrl, getPostIdentityKey } from '../src/services/dedup.service.js';
import type { CollectedPost } from '../src/types/social.types.js';

function makePost(overrides: Partial<CollectedPost> = {}): CollectedPost {
  return {
    platform: 'tiktok',
    platformPostId: '123',
    url: 'https://www.tiktok.com/@user/video/123',
    text: null,
    hashtags: [],
    publishedAt: null,
    author: { platformAuthorId: null, username: 'user', displayName: null, profileUrl: null, verified: null },
    metrics: { views: null, likes: null, comments: null, shares: null, saves: null },
    collectedAt: '2026-09-21T00:00:00.000Z',
    ...overrides,
  };
}

describe('canonicalizeUrl', () => {
  it('strips query string and trailing slash', () => {
    expect(canonicalizeUrl('https://www.tiktok.com/@user/video/123/?foo=bar')).toBe(
      'https://www.tiktok.com/@user/video/123',
    );
  });
});

describe('getPostIdentityKey', () => {
  it('prefers platformPostId', () => {
    expect(getPostIdentityKey({ platformPostId: '123', url: 'https://x/123' })).toBe('123');
  });

  it('falls back to canonical URL when platformPostId is empty', () => {
    expect(getPostIdentityKey({ platformPostId: '', url: 'https://x/123/?a=1' })).toBe('https://x/123');
  });
});

describe('InCollectionDeduper', () => {
  it('reports the first occurrence as unique and repeats as duplicates', () => {
    const deduper = new InCollectionDeduper();
    expect(deduper.isDuplicate(makePost({ platformPostId: '1' }))).toBe(false);
    expect(deduper.isDuplicate(makePost({ platformPostId: '2' }))).toBe(false);
    expect(deduper.isDuplicate(makePost({ platformPostId: '1' }))).toBe(true);
  });

  it('treats same URL with no platformPostId as duplicate', () => {
    const deduper = new InCollectionDeduper();
    const post = makePost({ platformPostId: '', url: 'https://www.tiktok.com/@user/video/999' });
    expect(deduper.isDuplicate(post)).toBe(false);
    expect(deduper.isDuplicate({ ...post, url: 'https://www.tiktok.com/@user/video/999?x=1' })).toBe(true);
  });
});
