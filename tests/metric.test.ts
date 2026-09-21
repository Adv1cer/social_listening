import { describe, expect, it } from 'vitest';
import { parseMetricValue } from '../src/utils/metric.js';

describe('parseMetricValue', () => {
  it.each([
    ['100', 100],
    ['1K', 1000],
    ['1.2K', 1200],
    ['10K', 10000],
    ['1M', 1000000],
    ['1.5M', 1500000],
    ['1B', 1000000000],
    ['2,345', 2345],
  ])('parses %s as %i', (input, expected) => {
    expect(parseMetricValue(input)).toBe(expected);
  });

  it.each([[''], [null], [undefined], ['abc'], ['--']])('returns null for %s', (input) => {
    expect(parseMetricValue(input as string | null | undefined)).toBeNull();
  });
});
