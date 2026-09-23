import { describe, expect, it } from 'vitest';
import { buildReport, monthPeriod, previousMonthPeriod, type ReportRunRow } from '../src/services/report.service.js';

const period = monthPeriod('2026-08');
const after = new Date('2026-09-01T02:00:00Z');

function run(queryType: string, status: string, startedAt = after, errorCode: string | null = null): ReportRunRow {
  return { queryType, queryValue: 'eventutcc', status, stopReason: null, errorCode, startedAt, finishedAt: startedAt };
}

const posts = [
  { url: 'v1', username: 'eventutcc', text: 'a', publishedAt: new Date('2026-08-03'), metric: { views: 100, likes: 10, comments: 2, shares: 1, saves: 0, capturedAt: after } },
  { url: 'v2', username: 'eventutcc', text: 'b', publishedAt: new Date('2026-08-10'), metric: { views: 300, likes: 5, comments: 0, shares: 0, saves: 1, capturedAt: after } },
];
const comments = [
  { text: 'later', likeCount: 0, publishedAt: new Date('2026-08-20'), videoUrl: 'v1', username: 'eventutcc' },
  { text: 'earlier', likeCount: 3, publishedAt: new Date('2026-08-05'), videoUrl: 'v1', username: 'eventutcc' },
];

describe('report periods (Asia/Bangkok)', () => {
  it('maps a month to Bangkok midnight boundaries', () => {
    expect(period.from.toISOString()).toBe('2026-07-31T17:00:00.000Z');
    expect(period.to.toISOString()).toBe('2026-08-31T17:00:00.000Z');
  });

  it('uses Bangkok local date to pick the previous month, including year rollover', () => {
    // 2026-09-30T18:00Z is already 1 Oct in Bangkok -> previous month is September.
    expect(previousMonthPeriod(new Date('2026-09-30T18:00:00Z')).label).toBe('2026-09');
    expect(previousMonthPeriod(new Date('2027-01-05T00:00:00Z')).label).toBe('2026-12');
  });
});

describe('buildReport', () => {
  const base = { period, usernames: ['eventutcc'], posts, comments, maxComments: 300, generatedAt: after };

  it('computes totals, top videos and orders comments chronologically', () => {
    const r = buildReport({ ...base, runs: [run('profile', 'completed'), run('profile_comments', 'completed')] });
    expect(r.accounts[0].totals).toEqual({ views: 400, likes: 15, comments: 2, shares: 1, saves: 1 });
    expect(r.accounts[0].topVideos[0].url).toBe('v2');
    expect(r.comments.items.map((c) => c.text)).toEqual(['earlier', 'later']);
    expect(r.sampleSize).toBe('2 comments across 2 videos from 1 account(s)');
    expect(r.dataQuality).toEqual({ complete: true, warnings: [] });
  });

  it('flags failed or missing runs so the report cannot claim "no complaints"', () => {
    const r = buildReport({ ...base, runs: [run('profile', 'failed', after, 'GRID_NOT_RENDERED')] });
    expect(r.dataQuality.complete).toBe(false);
    expect(r.dataQuality.warnings.join('\n')).toMatch(/GRID_NOT_RENDERED/);
    expect(r.dataQuality.warnings.join('\n')).toMatch(/no profile_comments collection run/);
  });

  it('flags runs that started before the period ended', () => {
    const early = new Date('2026-08-15T00:00:00Z');
    const r = buildReport({ ...base, runs: [run('profile', 'completed', early), run('profile_comments', 'completed')] });
    expect(r.dataQuality.complete).toBe(false);
  });

  it('truncates comments beyond maxComments and says so', () => {
    const r = buildReport({ ...base, maxComments: 1, runs: [] });
    expect(r.comments).toMatchObject({ total: 2, truncated: true });
    expect(r.comments.items).toHaveLength(1);
  });
});
