// Thin wrapper around Apify's "run actor synchronously and get dataset items"
// REST endpoint. This calls Apify's own hosted actor (e.g. clockworks's
// TikTok scraper) over their public API — it does not touch TikTok directly,
// so none of the anti-bot concerns that block our own collector apply here.
// https://docs.apify.com/api/v2#/reference/actors/run-actor-synchronously-and-get-dataset-items

export interface ApifyRunOptions {
  token: string;
  actorId: string;
  input: Record<string, unknown>;
  timeoutSecs?: number;
}

export class ApifyRunError extends Error {
  constructor(public readonly statusCode: number, message: string) {
    super(message);
    this.name = 'ApifyRunError';
  }
}

export async function runApifyActorForDatasetItems<T = Record<string, unknown>>(
  options: ApifyRunOptions,
): Promise<T[]> {
  const { token, actorId, input, timeoutSecs = 120 } = options;
  if (!token) throw new ApifyRunError(401, 'APIFY_TOKEN is not configured');

  const url = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&timeout=${timeoutSecs}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new ApifyRunError(response.status, `Apify actor run failed (${response.status}): ${body.slice(0, 500)}`);
  }

  return (await response.json()) as T[];
}
