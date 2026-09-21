import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { TikTokCollector } from '../src/collectors/tiktok/tiktok.collector.js';
import { classifyPageState } from '../src/collectors/tiktok/tiktok.block-detector.js';
import { loadEnv } from '../src/config/env.js';
import { CollectorBlockedError } from '../src/utils/errors.js';

function parseArg(name: string, fallback: string): string {
  const flag = `--${name}`;
  const index = process.argv.indexOf(flag);
  return index !== -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

// Diagnostic-only path: loads a single public TikTok URL directly (e.g. a
// video page) instead of running the search collection loop. Useful for
// checking whether a specific page is reachable/blocked when search itself
// is soft-blocked. Does not parse or persist anything.
async function inspectUrl(url: string, headed: boolean, saveDebug: boolean, channel?: string) {
  console.log(`Mode: direct URL inspection`);
  console.log(`URL: ${url}`);
  console.log(`Browser mode: ${headed ? 'headed' : 'headless'}${channel ? ` (channel: ${channel})` : ''}`);

  const browser = await chromium.launch({ headless: !headed, channel });
  const page = await browser.newPage();
  const startedAt = Date.now();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    const html = await page.content();
    const state = classifyPageState(html, page.url());
    const durationSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);

    console.log(`Final URL: ${page.url()}`);
    console.log(`Page title: ${await page.title()}`);
    console.log(`Page state: ${state.status}`);
    if (state.status !== 'ok') {
      console.log(`Evidence: ${JSON.stringify(state.evidence)}`);
    }
    console.log(`HTML length: ${html.length}`);
    console.log(`Duration: ${durationSeconds}s`);

    if (saveDebug) {
      const dir = join(process.cwd(), 'debug');
      mkdirSync(dir, { recursive: true });
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const screenshotPath = join(dir, `tiktok-url-${state.status}-${timestamp}.png`);
      await page.screenshot({ path: screenshotPath });
      console.log(`Debug screenshot: ${screenshotPath}`);
      const htmlPath = join(dir, `tiktok-url-${state.status}-${timestamp}.html`);
      writeFileSync(htmlPath, html, 'utf-8');
      console.log(`Debug HTML: ${htmlPath}`);
    }
  } finally {
    await browser.close();
  }
}

async function main() {
  const config = loadEnv(process.env);
  const keyword = parseArg('keyword', 'UTCC');
  const target = Number(parseArg('target', String(config.defaults.targetPostsPerQuery)));
  const headed = hasFlag('headed');
  const saveDebug = hasFlag('save-debug');
  const channel = process.argv.includes('--channel') ? parseArg('channel', '') || undefined : undefined;
  const directUrl = process.argv.includes('--url') ? parseArg('url', '') || undefined : undefined;

  if (directUrl) {
    await inspectUrl(directUrl, headed, saveDebug, channel);
    return;
  }

  const collector = new TikTokCollector({ headless: !headed, saveDebug, channel });
  const startedAt = Date.now();

  console.log(`Keyword: ${keyword}`);
  console.log(`Target posts: ${target}`);
  console.log(`Browser mode: ${headed ? 'headed' : 'headless'}${channel ? ` (channel: ${channel})` : ''}`);

  try {
    const result = await collector.collect({
      query: keyword,
      targetPosts: target,
      maxScrolls: config.defaults.maxScrollsPerQuery,
      maxCollectionTimeSeconds: config.collector.timeoutSeconds,
      maxConsecutiveEmptyScrolls: config.defaults.maxEmptyScrolls,
    });

    const durationSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);

    console.log(`Posts collected: ${result.returnedCount}`);
    console.log(`Target reached: ${result.targetReached ? 'yes' : 'no'}`);
    console.log(`Stop reason: ${result.stopReason}`);
    console.log(`Duration: ${durationSeconds}s`);
    if (saveDebug) {
      console.log('Debug artifacts (if any block/empty state occurred): ./debug/');
    }
  } catch (error) {
    const durationSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
    if (error instanceof CollectorBlockedError) {
      console.log(`Stop reason: blocked (${error.reason})`);
      console.log(`Duration: ${durationSeconds}s`);
      if (saveDebug) {
        console.log('Debug artifacts saved under ./debug/ — see filenames printed above.');
      }
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}

main().catch((error) => {
  console.error('Collector test failed:', error);
  process.exitCode = 1;
});
