import { afterEach, describe, expect, it, vi } from 'vitest';
import { runApifyActorForDatasetItems, ApifyRunError } from '../src/collectors/tiktok/tiktok.apify-client.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('runApifyActorForDatasetItems', () => {
  it('rejects immediately when no token is configured, without calling fetch', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    await expect(
      runApifyActorForDatasetItems({ token: '', actorId: 'clockworks~tiktok-scraper', input: {} }),
    ).rejects.toThrow(ApifyRunError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('posts the input to the run-sync-get-dataset-items endpoint and returns parsed items', async () => {
    const items = [{ id: '1' }, { id: '2' }];
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify(items), { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);

    const result = await runApifyActorForDatasetItems({
      token: 'tok',
      actorId: 'clockworks~tiktok-scraper',
      input: { hashtags: ['utcc'] },
    });

    expect(result).toEqual(items);
    const [url, requestInit] = fetchSpy.mock.calls[0];
    expect(String(url)).toContain('/acts/clockworks~tiktok-scraper/run-sync-get-dataset-items');
    expect(String(url)).toContain('token=tok');
    expect(JSON.parse(String((requestInit as RequestInit).body))).toEqual({ hashtags: ['utcc'] });
  });

  it('throws ApifyRunError with the status code on a non-ok response', async () => {
    const fetchSpy = vi.fn(async () => new Response('actor failed', { status: 500 }));
    vi.stubGlobal('fetch', fetchSpy);

    await expect(
      runApifyActorForDatasetItems({ token: 'tok', actorId: 'a', input: {} }),
    ).rejects.toMatchObject({ statusCode: 500 });
  });
});
