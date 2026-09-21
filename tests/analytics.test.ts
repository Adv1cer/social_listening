import { describe, expect, it } from 'vitest';
import { computeAnalyticsSummary, type AnalyticsRow } from '../src/services/analytics.service.js';

function row(overrides: Partial<AnalyticsRow>): AnalyticsRow {
  return {
    postId: 'p1',
    text: null,
    hashtags: [],
    publishedAt: new Date('2026-09-20T00:00:00.000Z'),
    views: null,
    likes: null,
    comments: null,
    shares: null,
    saves: null,
    url: 'https://www.tiktok.com/@u/video/1',
    ...overrides,
  };
}

describe('computeAnalyticsSummary', () => {
  it('sums engagement treating null as 0 without hiding missing data from totals', () => {
    const rows = [
      row({ postId: 'p1', views: 100, likes: 10, hashtags: ['UTCC'] }),
      row({ postId: 'p2', views: null, likes: 5, hashtags: ['UTCC', 'หอการค้า'] }),
    ];
    const summary = computeAnalyticsSummary(rows, 2, new Date('2026-09-14'), new Date('2026-09-21'));

    expect(summary.posts.total).toBe(2);
    expect(summary.posts.new).toBe(2);
    expect(summary.engagement.views).toBe(100);
    expect(summary.engagement.likes).toBe(15);
  });

  it('ranks top hashtags by frequency', () => {
    const rows = [
      row({ postId: 'p1', hashtags: ['UTCC'] }),
      row({ postId: 'p2', hashtags: ['UTCC', 'หอการค้า'] }),
      row({ postId: 'p3', hashtags: ['หอการค้า'] }),
    ];
    const summary = computeAnalyticsSummary(rows, 3, new Date('2026-09-14'), new Date('2026-09-21'));

    expect(summary.topHashtags[0]).toEqual({ tag: 'UTCC', count: 2 });
    expect(summary.topHashtags[1]).toEqual({ tag: 'หอการค้า', count: 2 });
  });

  it('ranks top posts by views descending, nulls last', () => {
    const rows = [
      row({ postId: 'p1', views: 100 }),
      row({ postId: 'p2', views: 500 }),
      row({ postId: 'p3', views: null }),
    ];
    const summary = computeAnalyticsSummary(rows, 3, new Date('2026-09-14'), new Date('2026-09-21'));

    expect(summary.topPosts.map((p) => p.postId)).toEqual(['p2', 'p1', 'p3']);
  });

  it('groups daily mentions by publishedAt date (UTC)', () => {
    const rows = [
      row({ postId: 'p1', publishedAt: new Date('2026-09-20T01:00:00.000Z') }),
      row({ postId: 'p2', publishedAt: new Date('2026-09-20T22:00:00.000Z') }),
      row({ postId: 'p3', publishedAt: new Date('2026-09-19T10:00:00.000Z') }),
    ];
    const summary = computeAnalyticsSummary(rows, 3, new Date('2026-09-14'), new Date('2026-09-21'));

    expect(summary.dailyMentions).toContainEqual({ date: '2026-09-20', count: 2 });
    expect(summary.dailyMentions).toContainEqual({ date: '2026-09-19', count: 1 });
  });
});
