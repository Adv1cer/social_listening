import { describe, expect, it } from 'vitest';
import { toIsoStringOrNull, nowIso } from '../src/utils/date.js';

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
