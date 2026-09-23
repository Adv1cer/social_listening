import type { Page } from 'playwright';
import { parseCommentListBody, type CollectedComment, type CommentParseResult } from './tiktok.comment-parser.js';

export type CommentStopReason =
  | 'no_more_results'
  | 'target_reached'
  | 'empty_scroll_limit'
  | 'captcha'
  | 'unavailable'
  | 'comments_withheld';

// Decouples the pagination/stop logic from Playwright so it can be unit
// tested with a fake, mirroring BatchLoader in tiktok.collector.ts.
export interface CommentPageDriver {
  open(url: string): Promise<'ok' | 'captcha' | 'unavailable'>;
  // Resolves with the next captured /api/comment/list response, or null if
  // none arrived within the driver's wait window.
  nextResponse(): Promise<CommentParseResult | null>;
  isCaptchaVisible(): Promise<boolean>;
}

export interface CommentLoopOptions {
  maxComments: number;
  maxEmptyWaits: number;
}

export interface CommentLoopResult {
  comments: CollectedComment[];
  stopReason: CommentStopReason;
  reportedTotal: number | null;
  pages: number;
}

export async function runCommentLoop(
  driver: CommentPageDriver,
  url: string,
  options: CommentLoopOptions,
): Promise<CommentLoopResult> {
  const byId = new Map<string, CollectedComment>();
  let reportedTotal: number | null = null;
  let pages = 0;
  let emptyWaits = 0;
  const done = (stopReason: CommentStopReason): CommentLoopResult => ({
    comments: [...byId.values()],
    stopReason,
    reportedTotal,
    pages,
  });

  const opened = await driver.open(url);
  if (opened !== 'ok') return done(opened);

  for (;;) {
    const result = await driver.nextResponse();
    if (result === null) {
      if (await driver.isCaptchaVisible()) return done('captcha');
      emptyWaits += 1;
      if (emptyWaits >= options.maxEmptyWaits) return done(pages === 0 ? 'comments_withheld' : 'empty_scroll_limit');
      continue;
    }
    if (result.type !== 'batch') {
      // Empty/invalid body: TikTok withheld this page. Check for a CAPTCHA,
      // otherwise count it like an empty wait so we don't loop forever.
      if (await driver.isCaptchaVisible()) return done('captcha');
      emptyWaits += 1;
      if (emptyWaits >= options.maxEmptyWaits) return done(pages === 0 ? 'comments_withheld' : 'empty_scroll_limit');
      continue;
    }
    emptyWaits = 0;
    pages += 1;
    if (result.batch.total !== null) reportedTotal = result.batch.total;
    for (const c of result.batch.comments) byId.set(c.platformCommentId, c);
    if (byId.size >= options.maxComments) return done('target_reached');
    if (!result.batch.hasMore) return done('no_more_results');
  }
}

// Completeness is decided by pagination, not by `total`: verified on
// 2026-09-23 that `total` can exceed the comments TikTok actually shows
// (e.g. total=9 while the page visibly lists 6), so a total-based ratio
// produced false "incomplete" flags. `has_more=0` is the reliable signal.
// reportedTotal is still kept for diagnostics.
export function isCommentCollectionComplete(result: CommentLoopResult): boolean {
  return result.stopReason === 'target_reached' || result.stopReason === 'no_more_results';
}

const COMMENT_ICON = '[data-e2e="comment-icon"]';
const COMMENT_ITEM = '[data-e2e="comment-level-1"]';

export class PlaywrightCommentDriver implements CommentPageDriver {
  private queue: CommentParseResult[] = [];
  private waiters: ((r: CommentParseResult) => void)[] = [];

  constructor(
    private readonly page: Page,
    private readonly waitMs = 6000,
  ) {
    page.on('response', async (res) => {
      if (!res.url().includes('/api/comment/list')) return;
      let parsed: CommentParseResult;
      try {
        parsed = parseCommentListBody(await res.text());
      } catch {
        parsed = { type: 'invalid', reason: 'body_unavailable' };
      }
      const waiter = this.waiters.shift();
      if (waiter) waiter(parsed);
      else this.queue.push(parsed);
    });
  }

  async open(url: string): Promise<'ok' | 'captcha' | 'unavailable'> {
    const resp = await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => null);
    if (!resp || resp.status() >= 400) return 'unavailable';
    await this.page.waitForTimeout(3000 + Math.floor(Math.random() * 2000));
    if (await this.isCaptchaVisible()) return 'captcha';
    // The page fires an early comment/list request on load that comes back
    // empty; only the request triggered by opening the panel carries data.
    this.queue = [];
    const icon = this.page.locator(COMMENT_ICON).first();
    if ((await icon.count()) === 0) return 'unavailable';
    const clicked = await icon.click({ timeout: 5000 }).then(() => true).catch(() => false);
    return clicked ? 'ok' : 'unavailable';
  }

  async nextResponse(): Promise<CommentParseResult | null> {
    const queued = this.queue.shift();
    if (queued) return queued;
    const next = new Promise<CommentParseResult | null>((resolve) => {
      const waiter = (r: CommentParseResult) => {
        clearTimeout(timer);
        resolve(r);
      };
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w !== waiter);
        resolve(null);
      }, this.waitMs);
      this.waiters.push(waiter);
    });
    await this.scrollCommentList();
    return next;
  }

  async isCaptchaVisible(): Promise<boolean> {
    const html = await this.page.content().catch(() => '');
    return html.includes('captcha-verify') || /captcha|verify/i.test(await this.page.title().catch(() => ''));
  }

  private async scrollCommentList(): Promise<void> {
    // Scrolling the last rendered comment into view scrolls whichever
    // container holds the list, which is what triggers the next page.
    const items = this.page.locator(COMMENT_ITEM);
    const count = await items.count();
    if (count > 0) await items.nth(count - 1).scrollIntoViewIfNeeded().catch(() => {});
    else await this.page.mouse.wheel(0, 1500);
    await this.page.waitForTimeout(800 + Math.floor(Math.random() * 700));
  }
}
