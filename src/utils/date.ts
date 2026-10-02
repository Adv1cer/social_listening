export function toIsoStringOrNull(value: unknown): string | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** Newest-first profile grids: keep in-year, stop once we hit older, skip undated/newer. */
export type YearFilterDecision = 'keep' | 'skip' | 'stop';

export function decideYearFilter(
  publishedAt: string | null | undefined,
  year: number | undefined,
): YearFilterDecision {
  if (year == null) return 'keep';
  if (publishedAt == null) return 'skip';
  const parsed = new Date(publishedAt);
  if (Number.isNaN(parsed.getTime())) return 'skip';
  const postYear = parsed.getUTCFullYear();
  if (postYear < year) return 'stop';
  if (postYear > year) return 'skip';
  return 'keep';
}

/**
 * Profile grids can pin up to 3 old videos above the chronological feed.
 * Require a streak longer than that before treating it as year_cutoff.
 */
export function nextYearCutoffState(
  decision: YearFilterDecision,
  olderStreak: number,
  streakLimit = 4,
): { olderStreak: number; cutoff: boolean; action: 'keep' | 'skip' } {
  if (decision === 'keep') return { olderStreak: 0, cutoff: false, action: 'keep' };
  if (decision === 'stop') {
    const next = olderStreak + 1;
    return { olderStreak: next, cutoff: next >= streakLimit, action: 'skip' };
  }
  return { olderStreak, cutoff: false, action: 'skip' };
}
