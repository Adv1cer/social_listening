import { describe, expect, it } from 'vitest';
import { collectionRequestSchema } from '../src/schemas/collection.schema.js';
import { listPostsQuerySchema } from '../src/schemas/post.schema.js';
import { analyticsSummaryQuerySchema } from '../src/schemas/analytics.schema.js';
import { profileCollectionRequestSchema } from '../src/schemas/profile-collection.schema.js';

describe('collectionRequestSchema', () => {
  it('trims, dedupes, and drops empty keywords; applies defaults', () => {
    const parsed = collectionRequestSchema.parse({
      platform: 'tiktok',
      keywords: [' UTCC ', 'UTCC', '', '  ', 'หอการค้า'],
    });
    expect(parsed.keywords).toEqual(['UTCC', 'หอการค้า']);
    expect(parsed.targetPostsPerQuery).toBe(30);
    expect(parsed.maxScrollsPerQuery).toBe(30);
    expect(parsed.maxCollectionTimePerQuerySeconds).toBe(120);
  });

  it('rejects more than 20 keywords', () => {
    const keywords = Array.from({ length: 21 }, (_, i) => `kw${i}`);
    expect(() => collectionRequestSchema.parse({ platform: 'tiktok', keywords })).toThrow();
  });

  it('rejects zero keywords after cleanup', () => {
    expect(() => collectionRequestSchema.parse({ platform: 'tiktok', keywords: ['', '  '] })).toThrow();
  });

  it('rejects targetPostsPerQuery outside 1..1000', () => {
    expect(() =>
      collectionRequestSchema.parse({ platform: 'tiktok', keywords: ['a'], targetPostsPerQuery: 1001 }),
    ).toThrow();
  });
});

describe('listPostsQuerySchema', () => {
  it('applies sane defaults for limit/offset/sort', () => {
    const parsed = listPostsQuerySchema.parse({});
    expect(parsed.limit).toBe(20);
    expect(parsed.offset).toBe(0);
    expect(parsed.sort).toBe('publishedAt_desc');
  });
});

describe('analyticsSummaryQuerySchema', () => {
  it('defaults to a 7 day period when from/to are omitted', () => {
    const parsed = analyticsSummaryQuerySchema.parse({});
    expect(parsed.from).toBeUndefined();
    expect(parsed.to).toBeUndefined();
  });
});

describe('profileCollectionRequestSchema', () => {
  it('accepts optional year for 2026-only scrapes', () => {
    const parsed = profileCollectionRequestSchema.parse({
      platform: 'tiktok',
      usernames: ['eventutcc'],
      year: 2026,
      targetPostsPerProfile: 500,
      maxScrollsPerProfile: 200,
    });
    expect(parsed.year).toBe(2026);
    expect(parsed.targetPostsPerProfile).toBe(500);
  });

  it('rejects year outside 2016..2030', () => {
    expect(() =>
      profileCollectionRequestSchema.parse({ platform: 'tiktok', year: 2010 }),
    ).toThrow();
  });
});
