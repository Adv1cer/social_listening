import type { BrowserContext } from 'playwright';

// Manual, opt-in diagnostic: why does profile discovery find 0 videos?
// Loads a profile page in the given mode and reports what actually rendered.
// Screenshots/HTML go to debug/ (gitignored).
// Usage: npx tsx scripts/test-profile-probe.ts --username eventutcc [--stealth] [--profile-dir .browser-profile/tiktok] [--headless false]
import { mkdirSync, writeFileSync } from 'node:fs';

function arg(name: string, fallback: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback;
}
const flag = (n: string) => process.argv.includes(`--${n}`);

async function main() {
  const username = arg('username', 'eventutcc');
  const headless = arg('headless', 'true') !== 'false';
  const profileDir = arg('profile-dir', '');
  const chromium = flag('stealth')
    ? await (async () => {
        const { chromium } = await import('playwright-extra');
        chromium.use((await import('puppeteer-extra-plugin-stealth')).default());
        return chromium;
      })()
    : (await import('playwright')).chromium;

  let context: BrowserContext;
  let close: () => Promise<void>;
  if (profileDir) {
    context = await chromium.launchPersistentContext(profileDir, { headless, locale: 'th-TH', viewport: { width: 1366, height: 900 } });
    close = () => context.close();
  } else {
    const browser = await chromium.launch({ headless });
    context = await browser.newContext({ locale: 'th-TH', viewport: { width: 1366, height: 900 } });
    close = () => browser.close();
  }

  const apiHits: string[] = [];
  const page = await context.newPage();
  page.on('response', async (res) => {
    if (!res.url().includes('/api/post/item_list')) return;
    const body = await res.text().catch(() => '');
    apiHits.push(`${res.status()} bytes=${body.length}`);
  });

  const mode = `${flag('stealth') ? 'stealth' : 'plain'}-${profileDir ? 'login' : 'anon'}-${headless ? 'headless' : 'headful'}`;
  try {
    const resp = await page.goto(`https://www.tiktok.com/@${username}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    console.log('mode:', mode, '| status:', resp?.status(), '| final url:', page.url());
    for (const wait of [3000, 5000, 7000]) {
      await page.waitForTimeout(wait);
      const links = await page.locator('a[href*="/video/"]').count();
      const items = await page.locator('[data-e2e="user-post-item"]').count();
      console.log(`after +${wait}ms: video links=${links} user-post-item=${items}`);
      if (links > 0) break;
    }
    const html = await page.content();
    console.log('title:', await page.title());
    console.log('captcha marker:', html.includes('captcha-verify') || /captcha|verify/i.test(await page.title()));
    console.log('markers:', {
      userPostList: html.includes('user-post-item-list'),
      privateOrEmpty: /This account is private|No content|ยังไม่มีวิดีโอ|บัญชีนี้เป็นส่วนตัว/.test(html),
      loginModal: html.includes('login-modal') || html.includes('type="password"'),
      rehydration: html.includes('__UNIVERSAL_DATA_FOR_REHYDRATION__'),
    });
    console.log('item_list API hits:', apiHits);
    mkdirSync('debug', { recursive: true });
    await page.screenshot({ path: `debug/profile-${username}-${mode}.png`, fullPage: false });
    writeFileSync(`debug/profile-${username}-${mode}.html`, html);
    console.log(`saved debug/profile-${username}-${mode}.png/.html`);
  } finally {
    await close();
  }
}
main().catch((e) => { console.error('probe failed:', e); process.exitCode = 1; });
