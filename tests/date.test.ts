import { describe, expect, it } from 'vitest';
import {
  toIsoStringOrNull,
  nowIso,
  decideYearFilter,
  nextYearCutoffState,
} from '../src/utils/date.js';

describe('date utils', () => {
  it('converts a valid date-like value to ISO string', () => {
    expect(toIsoStringOrNull('2026-09-21T00:00:00.000Z')).toBe('2026-09-21T00:00:00.000Z');
  });

  it('returns null for invalid or missing input', () => {
    expect(toIsoStringOrNull(null)).toBeNull();
    expect(toIsoStringOrNull(undefined)).toBeNull();
    expect(toIsoStringOrNull('not-a-date')).toBeNull();
  });

  it('nowIso returns a parseable ISO string', () => {
    expect(Number.isNaN(Date.parse(nowIso()))).toBe(false);
  });
});

describe('decideYearFilter', () => {
  it('keeps every post when no year filter is set', () => {
    expect(decideYearFilter('2025-01-01T00:00:00.000Z', undefined)).toBe('keep');
    expect(decideYearFilter(null, undefined)).toBe('keep');
  });

  it('keeps posts in the target year', () => {
    expect(decideYearFilter('2026-03-15T12:00:00.000Z', 2026)).toBe('keep');
  });

  it('stops on dated posts older than the target year (newest-first profiles)', () => {
    expect(decideYearFilter('2025-12-31T23:59:59.000Z', 2026)).toBe('stop');
  });

  it('skips undated / invalid dates so they never slip through as in-year', () => {
    expect(decideYearFilter(null, 2026)).toBe('skip');
    expect(decideYearFilter('not-a-date', 2026)).toBe('skip');
  });

  it('skips posts newer than the target year without stopping', () => {
    expect(decideYearFilter('2027-01-01T00:00:00.000Z', 2026)).toBe('skip');
  });
});

describe('nextYearCutoffState', () => {
  it('does not cutoff on a single older post (pinned video at top of grid)', () => {
    expect(nextYearCutoffState('stop', 0, 3)).toEqual({
      olderStreak: 1,
      cutoff: false,
      action: 'skip',
    });
  });

  it('cutoffs after the configured consecutive older streak', () => {
    expect(nextYearCutoffState('stop', 2, 3)).toEqual({
      olderStreak: 3,
      cutoff: true,
      action: 'skip',
    });
  });

  it('resets the older streak when an in-year post is kept', () => {
    expect(nextYearCutoffState('keep', 2, 3)).toEqual({
      olderStreak: 0,
      cutoff: false,
      action: 'keep',
    });
  });
});
