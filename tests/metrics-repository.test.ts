import { describe, expect, it } from 'vitest';
import { hasMetricsChanged } from '../src/repositories/metrics.repository.js';

describe('hasMetricsChanged', () => {
  it('returns true when there is no prior snapshot', () => {
    expect(hasMetricsChanged(null, { views: 10, likes: 1, comments: 0, shares: 0, saves: null })).toBe(true);
  });

  it('returns false when every field matches the latest snapshot', () => {
    const latest = { views: 10000, likes: 500, comments: 20, shares: 5, saves: null };
    expect(hasMetricsChanged(latest, { views: 10000, likes: 500, comments: 20, shares: 5, saves: null })).toBe(
      false,
    );
  });

  it('returns true when any single field differs (e.g. views grew)', () => {
    const latest = { views: 10000, likes: 500, comments: 20, shares: 5, saves: null };
    expect(hasMetricsChanged(latest, { views: 40000, likes: 500, comments: 20, shares: 5, saves: null })).toBe(
      true,
    );
  });

  it('distinguishes null (unknown) from 0 (observed zero)', () => {
    const latest = { views: 0, likes: null, comments: 0, shares: 0, saves: null };
    expect(hasMetricsChanged(latest, { views: 0, likes: 0, comments: 0, shares: 0, saves: null })).toBe(true);
  });
});
