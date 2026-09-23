import type { Page } from 'playwright';
import { classifyPageState } from './tiktok.block-detector.js';

const VIDEO_LINK_SELECTOR = 'a[href*="/video/"]';

export interface ProfileDiscoveryOptions {
  targetVideos: number;
  maxScrolls: number;
  scrollWaitMs?: number;
  selectorTimeoutMs?: number;
}

export type ProfileDiscoveryResult =
  | { status: 'ok'; videoUrls: string[] }
  | { status: 'blocked'; reason: string; videoUrls: string[] }
  | { status: 'not_rendered'; reason: string; videoUrls: string[] };

export class ProfileDiscovery {
  constructor(private readonly page: Page) {}

  async discover(username: string, options: ProfileDiscoveryOptions): Promise<ProfileDiscoveryResult> {
    const { targetVideos, maxScrolls, scrollWaitMs = 2000, selectorTimeoutMs = 15000 } = options;
    const url = `https://www.tiktok.com/@${username}`;

    await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    const html = await this.page.content();
    const state = classifyPageState(html, this.page.url());
    if (state.status !== 'ok') {
      return { status: 'blocked', reason: state.status.toUpperCase(), videoUrls: [] };
    }

    try {
      // state 'attached', not the default 'visible': in headless the grid's
      // anchors exist in the DOM (probe counted 19 via locator.count()) but
      // can fail Playwright's visibility check, which made this time out.
      await this.page.waitForSelector(VIDEO_LINK_SELECTOR, { timeout: selectorTimeoutMs, state: 'attached' });
    } catch {
      // Grid never hydrated. Verified live on 2026-09-23: an anonymous plain
      // Chromium gets a 200 profile page whose CAPTCHA and empty item_list
      // response arrive *after* domcontentloaded, so the first check above
      // passes. Re-check now; and never report this as "zero videos" — a
      // genuinely empty profile is rare, a withheld grid is not.
      const lateHtml = await this.page.content();
      const lateState = classifyPageState(lateHtml, this.page.url());
      if (lateState.status !== 'ok') {
        return { status: 'blocked', reason: lateState.status.toUpperCase(), videoUrls: [] };
      }
      return { status: 'not_rendered', reason: 'GRID_NOT_RENDERED', videoUrls: [] };
    }

    const seen = new Set<string>();
    let scrolls = 0;
    let stagnantRounds = 0;

    while (seen.size < targetVideos && scrolls < maxScrolls && stagnantRounds < 2) {
      const hrefs = await this.page.$$eval(VIDEO_LINK_SELECTOR, (anchors) =>
        anchors.map((a) => a.getAttribute('href')).filter((h): h is string => !!h),
      );
      const before = seen.size;
      for (const href of hrefs) seen.add(href);
      stagnantRounds = seen.size === before ? stagnantRounds + 1 : 0;

      if (seen.size >= targetVideos) break;

      await this.page.mouse.wheel(0, 3000);
      await this.page.waitForTimeout(scrollWaitMs);
      scrolls += 1;
    }

    return { status: 'ok', videoUrls: [...seen] };
  }
}
