import * as cheerio from 'cheerio';
import { TIKTOK_SELECTORS } from './tiktok.selectors.js';

export interface RawTikTokPost {
  postId: string | null;
  url: string | null;
  captionText: string | null;
  publishedAtRaw: string | null;
  authorUsername: string | null;
  authorDisplayName: string | null;
  authorProfileUrl: string | null;
  viewsRaw: string | null;
  likesRaw: string | null;
  commentsRaw: string | null;
  sharesRaw: string | null;
}

function textOrNull(value: string | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function extractPostId(url: string | null): string | null {
  if (!url) return null;
  const match = /\/video\/(\d+)/.exec(url);
  return match ? match[1] : null;
}

export function parseSearchResultsHtml(html: string): RawTikTokPost[] {
  const $ = cheerio.load(html);
  const cards = $(TIKTOK_SELECTORS.searchResultItem);

  return cards
    .map((_, el) => {
      const card = $(el);
      const url = textOrNull(card.find(TIKTOK_SELECTORS.postLink).first().attr('href')) ?? null;

      return {
        postId: extractPostId(url),
        url,
        captionText: textOrNull(card.find(TIKTOK_SELECTORS.caption).first().text()),
        publishedAtRaw: textOrNull(card.find(TIKTOK_SELECTORS.publishedTime).first().attr('datetime')),
        authorUsername: textOrNull(card.find(TIKTOK_SELECTORS.authorUsername).first().text()),
        authorDisplayName: textOrNull(card.find(TIKTOK_SELECTORS.authorDisplayName).first().text()),
        authorProfileUrl: textOrNull(card.find(TIKTOK_SELECTORS.authorProfileLink).first().attr('href')),
        viewsRaw: textOrNull(card.find(TIKTOK_SELECTORS.viewCount).first().text()),
        likesRaw: textOrNull(card.find(TIKTOK_SELECTORS.likeCount).first().text()),
        commentsRaw: textOrNull(card.find(TIKTOK_SELECTORS.commentCount).first().text()),
        sharesRaw: textOrNull(card.find(TIKTOK_SELECTORS.shareCount).first().text()),
      } satisfies RawTikTokPost;
    })
    .get();
}
