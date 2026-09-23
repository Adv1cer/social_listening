import type { BrowserContext } from 'playwright';

export interface TikTokBrowserOptions {
  headless: boolean;
  // Persistent profile holding a logged-in TikTok session. Verified live on
  // 2026-09-23: anonymous plain Chromium gets profile grids and comment lists
  // withheld (empty 200 + CAPTCHA); stealth + logged-in session gets both.
  profileDir: string;
}

export async function launchTikTokContext(options: TikTokBrowserOptions): Promise<BrowserContext> {
  const { chromium } = await import('playwright-extra');
  const stealth = (await import('puppeteer-extra-plugin-stealth')).default;
  chromium.use(stealth());
  return chromium.launchPersistentContext(options.profileDir, {
    headless: options.headless,
    locale: 'th-TH',
    viewport: { width: 1366, height: 900 },
  });
}

export async function hasTikTokSession(context: BrowserContext): Promise<boolean> {
  const cookies = await context.cookies('https://www.tiktok.com');
  return cookies.some((c) => c.name === 'sessionid' && c.value.length > 0);
}
