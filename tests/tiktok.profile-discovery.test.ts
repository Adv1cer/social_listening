import { describe, expect, it, vi } from 'vitest';
import { ProfileDiscovery } from '../src/collectors/tiktok/tiktok.profile-discovery.js';

function fakePage(opts: {
  html: string;
  url?: string;
  waitForSelectorFails?: boolean;
  hrefBatches: string[][];
}) {
  let evalCall = 0;
  return {
    goto: vi.fn(async () => undefined),
    content: vi.fn(async () => opts.html),
    url: vi.fn(() => opts.url ?? 'https://www.tiktok.com/@eventutcc'),
    waitForSelector: vi.fn(async () => {
      if (opts.waitForSelectorFails) throw new Error('timeout');
    }),
    $$eval: vi.fn(async () => {
      const batch = opts.hrefBatches[Math.min(evalCall, opts.hrefBatches.length - 1)];
      evalCall += 1;
      return batch;
    }),
    evaluate: vi.fn(async () => undefined),
    waitForTimeout: vi.fn(async () => undefined),
  } as never;
}

describe('ProfileDiscovery', () => {
  it('reports blocked without scrolling when the profile page itself is gated', async () => {
    const page = fakePage({ html: '<div data-e2e="login-title">Log in</div>', hrefBatches: [[]] });
    const discovery = new ProfileDiscovery(page);
    const result = await discovery.discover('eventutcc', { targetVideos: 10, maxScrolls: 5 });
    expect(result.status).toBe('blocked');
  });

  it('reports not_rendered (never a clean zero) when the grid never hydrates', async () => {
    const page = fakePage({ html: '<html></html>', waitForSelectorFails: true, hrefBatches: [[]] });
    const discovery = new ProfileDiscovery(page);
    const result = await discovery.discover('eventutcc', { targetVideos: 10, maxScrolls: 5 });
    expect(result).toEqual({ status: 'not_rendered', reason: 'GRID_NOT_RENDERED', videoUrls: [] });
  });

  it('reports blocked when a CAPTCHA appears after the grid wait times out', async () => {
    const htmls = ['<html></html>', '<div id="captcha-verify-container"></div>'];
    let i = 0;
    const page = fakePage({ html: '', waitForSelectorFails: true, hrefBatches: [[]] }) as unknown as { content: () => Promise<string> };
    page.content = async () => htmls[Math.min(i++, 1)];
    const discovery = new ProfileDiscovery(page as never);
    const result = await discovery.discover('eventutcc', { targetVideos: 10, maxScrolls: 5 });
    expect(result.status).toBe('blocked');
  });

  it('dedupes links across scrolls and stops once the target is reached', async () => {
    const page = fakePage({
      html: '<html></html>',
      hrefBatches: [
        ['/@e/video/1', '/@e/video/2'],
        ['/@e/video/1', '/@e/video/2', '/@e/video/3'],
      ],
    });
    const discovery = new ProfileDiscovery(page, );
    const result = await discovery.discover('eventutcc', { targetVideos: 3, maxScrolls: 10, scrollWaitMs: 0 });
    expect(result.status).toBe('ok');
    expect(result.videoUrls).toHaveLength(3);
  });

  it('does not truncate beyond target (approximate, not a hard cap) when a batch overshoots', async () => {
    const page = fakePage({
      html: '<html></html>',
      hrefBatches: [['/@e/video/1', '/@e/video/2', '/@e/video/3', '/@e/video/4', '/@e/video/5']],
    });
    const discovery = new ProfileDiscovery(page);
    const result = await discovery.discover('eventutcc', { targetVideos: 3, maxScrolls: 10, scrollWaitMs: 0 });
    expect(result.videoUrls).toHaveLength(5);
  });

  it('stops via stagnation safety limit when scrolling stops yielding new links', async () => {
    const page = fakePage({
      html: '<html></html>',
      hrefBatches: [['/@e/video/1']],
    });
    const discovery = new ProfileDiscovery(page);
    const result = await discovery.discover('eventutcc', { targetVideos: 50, maxScrolls: 100, scrollWaitMs: 0 });
    expect(result.videoUrls).toHaveLength(1);
    expect((page as { evaluate: { mock: { calls: unknown[] } } }).evaluate.mock.calls.length).toBeLessThan(10);
  });
});
