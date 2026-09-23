import type { Page } from 'playwright';
import type { CollectedPost, CollectionSource } from '../../types/social.types.js';
import { classifyPageState } from './tiktok.block-detector.js';
import { extractVideoDetailItem, normalizeVideoDetailToPost } from './tiktok.video-detail.js';
import { nowIso } from '../../utils/date.js';

export type EnrichResult =
  | { type: 'post'; post: CollectedPost }
  | { type: 'blocked'; reason: string }
  | { type: 'unavailable' };

export class DirectVideoEnricher {
  constructor(private readonly page: Page) {}

  async enrich(url: string, source: CollectionSource, query: string | null): Promise<EnrichResult> {
    await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await this.page.waitForTimeout(1500);

    const html = await this.page.content();
    const state = classifyPageState(html, this.page.url());
    if (state.status !== 'ok') {
      return { type: 'blocked', reason: state.status.toUpperCase() };
    }

    const item = extractVideoDetailItem(html);
    if (!item) return { type: 'unavailable' };

    const post = normalizeVideoDetailToPost(item, this.page.url(), nowIso(), source, query);
    if (!post) return { type: 'unavailable' };

    return { type: 'post', post };
  }
}
