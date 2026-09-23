import type { BrowserContext, Page } from 'playwright';

// Manual, opt-in diagnostic (not run by CI): checks whether TikTok comment
// text can be captured by intercepting /api/comment/list while viewing a video.
// No DB writes.
//
// Flags:
//   --video-url <url>
//   --headless true|false        (default true)
//   --profile-dir <dir>          persistent browser profile (cookies/session). Gitignored: .browser-profile/
//   --login-wait <seconds>       open TikTok and wait so you can log in manually before probing (needs --headless false)
//   --manual-wait <seconds>      skip auto-click; let a human solve CAPTCHA / open comments
//   --stealth                    use playwright-extra + stealth plugin (npm i -D playwright-extra puppeteer-extra-plugin-stealth)
function parseArg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback;
}
const hasFlag = (name: string) => process.argv.includes(`--${name}`);

async function loadChromium() {
  if (!hasFlag('stealth')) return (await import('playwright')).chromium;
  const { chromium } = await import('playwright-extra');
  const stealth = (await import('puppeteer-extra-plugin-stealth')).default;
  chromium.use(stealth());
  return chromium;
}

async function openContext(): Promise<{ context: BrowserContext; close: () => Promise<void> }> {
  const chromium = await loadChromium();
  const headless = parseArg('headless', 'true') !== 'false';
  const profileDir = parseArg('profile-dir', '');
  const opts = { headless, locale: 'th-TH', viewport: { width: 1366, height: 900 } };
  if (profileDir) {
    const context = await chromium.launchPersistentContext(profileDir, opts);
    return { context, close: () => context.close() };
  }
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({ locale: opts.locale, viewport: opts.viewport });
  return { context, close: () => browser.close() };
}

async function isLoggedIn(context: BrowserContext): Promise<boolean> {
  const cookies = await context.cookies('https://www.tiktok.com');
  return cookies.some((c) => c.name === 'sessionid' && c.value.length > 0);
}

async function main() {
  const url = parseArg('video-url', 'https://www.tiktok.com/@eventutcc/video/7685345255792692501');
  const loginWait = Number(parseArg('login-wait', '0'));
  const { context, close } = await openContext();
  const comments: { cid: string; text: string; likes: number; createTime: number }[] = [];
  const apiHits: { status: number; bytes: number; note?: string }[] = [];

  try {
    if (loginWait > 0) {
      const loginPage = await context.newPage();
      await loginPage.goto('https://www.tiktok.com/login', { waitUntil: 'domcontentloaded' });
      console.log(`Log in manually in the opened window. Waiting up to ${loginWait}s...`);
      const deadline = Date.now() + loginWait * 1000;
      while (Date.now() < deadline && !(await isLoggedIn(context))) await loginPage.waitForTimeout(2000);
      await loginPage.close();
    }
    console.log('logged in (sessionid cookie present):', await isLoggedIn(context));

    const page: Page = await context.newPage();
    page.on('response', async (res) => {
      if (!res.url().includes('/api/comment/list')) return;
      let body = '';
      try {
        body = await res.text();
      } catch (e) {
        apiHits.push({ status: res.status(), bytes: -1, note: `body unavailable: ${(e as Error).message}` });
        return;
      }
      if (!body) {
        apiHits.push({ status: res.status(), bytes: 0, note: 'empty body' });
        return;
      }
      try {
        const json = JSON.parse(body);
        apiHits.push({ status: res.status(), bytes: body.length, note: `status_code=${json.status_code}` });
        for (const c of json.comments ?? []) {
          comments.push({ cid: c.cid, text: c.text, likes: c.digg_count, createTime: c.create_time });
        }
      } catch {
        apiHits.push({ status: res.status(), bytes: body.length, note: 'non-JSON body' });
      }
    });

    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    console.log('page status:', resp?.status());
    await page.waitForTimeout(5000);
    const html = await page.content();
    console.log('captcha marker:', /captcha|verify/i.test(await page.title()) || html.includes('captcha-verify'));
    console.log('navigator.webdriver:', await page.evaluate(() => navigator.webdriver));
    const manualWait = Number(parseArg('manual-wait', '0'));
    if (manualWait > 0) {
      console.log(`Manual mode: solve CAPTCHA / open comments yourself. Waiting ${manualWait}s...`);
      await page.waitForTimeout(manualWait * 1000);
    } else {
      const selectors = ['[data-e2e="comment-icon"]', '[data-e2e="browse-comment-icon"]', 'button:has([data-e2e="comment-icon"])'];
      for (const sel of selectors) {
        const n = await page.locator(sel).count();
        let clicked = false;
        if (n) clicked = await page.locator(sel).first().click({ timeout: 5000 }).then(() => true).catch(() => false);
        console.log(`comment button ${sel}: found=${n} clicked=${clicked}`);
        if (clicked) break;
      }
      await page.waitForTimeout(3000);
      console.log('captcha marker after click:', /captcha|verify/i.test(await page.title()) || (await page.content()).includes('captcha-verify'));
    }
    for (let i = 0; i < 6; i++) {
      await page.mouse.wheel(0, 2000);
      await page.waitForTimeout(1500 + Math.floor(Math.random() * 1000));
    }
    console.log('DOM comment-level-1 nodes:', await page.locator('[data-e2e="comment-level-1"]').count());
    console.log('comment API hits:', JSON.stringify(apiHits));
    console.log('captured comments:', comments.length);
    console.log(JSON.stringify(comments.slice(0, 5), null, 2));
  } finally {
    await close();
  }
}

main().catch((e) => {
  console.error('probe failed:', e);
  process.exitCode = 1;
});
