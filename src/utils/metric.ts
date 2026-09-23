const SUFFIX_MULTIPLIERS: Record<string, number> = {
  '': 1,
  K: 1_000,
  M: 1_000_000,
  B: 1_000_000_000,
};

export function parseMetricValue(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const trimmed = raw.trim().replace(/,/g, '');
  if (trimmed === '') return null;

  const match = /^(\d+(?:\.\d+)?)([KMB]?)$/i.exec(trimmed);
  if (!match) return null;

  const [, numberPart, suffixPart] = match;
  const value = Number(numberPart);
  if (Number.isNaN(value)) return null;

  const multiplier = SUFFIX_MULTIPLIERS[suffixPart.toUpperCase()];
  return Math.round(value * multiplier);
}

export function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}
