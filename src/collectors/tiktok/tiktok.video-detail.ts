import { extractHashtags } from '../../utils/hashtag.js';
import { toNumberOrNull } from '../../utils/metric.js';
import type { CollectedPost, CollectionSource } from '../../types/social.types.js';

// TikTok server-renders full post data into this script tag on both direct
// video pages and (unlike search/tag feeds) does NOT require any client-side
// API call, so it isn't subject to the anti-bot empty-body gate that blocks
// search/tag/profile-video-list requests. See tiktok.profile-discovery.ts for
// why the profile page itself still needs a different (DOM-scroll) approach.
const UNIVERSAL_DATA_RE = /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>(.*?)<\/script>/s;

export function extractUniversalData(html: string): Record<string, unknown> | null {
  const match = UNIVERSAL_DATA_RE.exec(html);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]);
    return (parsed as { __DEFAULT_SCOPE__?: Record<string, unknown> }).__DEFAULT_SCOPE__ ?? null;
  } catch {
    return null;
  }
}

export interface TikTokVideoDetailAuthor {
  id?: string;
  uniqueId?: string;
  nickname?: string;
  verified?: boolean;
  [key: string]: unknown;
}

export interface TikTokVideoDetailStats {
  diggCount?: number | string;
  playCount?: number | string;
  commentCount?: number | string;
  shareCount?: number | string;
  collectCount?: number | string;
}

export interface TikTokVideoDetailItem {
  id: string;
  desc?: string;
  createTime?: string | number;
  author?: TikTokVideoDetailAuthor;
  stats?: TikTokVideoDetailStats;
  music?: Record<string, unknown>;
  video?: Record<string, unknown>;
  locationCreated?: unknown;
  poi?: unknown;
}

export function extractVideoDetailItem(html: string): TikTokVideoDetailItem | null {
  const scope = extractUniversalData(html);
  if (!scope) return null;
  const detail = scope['webapp.video-detail'] as
    | { itemInfo?: { itemStruct?: TikTokVideoDetailItem } }
    | undefined;
  return detail?.itemInfo?.itemStruct ?? null;
}

export function normalizeVideoDetailToPost(
  item: TikTokVideoDetailItem,
  fallbackUrl: string,
  collectedAt: string,
  source: CollectionSource,
  query: string | null,
): CollectedPost | null {
  if (!item.id) return null;

  const username = item.author?.uniqueId ?? null;
  const url = username ? `https://www.tiktok.com/@${username}/video/${item.id}` : fallbackUrl;
  const createTimeSeconds = Number(item.createTime);
  const publishedAt = Number.isFinite(createTimeSeconds) ? new Date(createTimeSeconds * 1000).toISOString() : null;
  const hashtags = extractHashtags(item.desc);

  return {
    platform: 'tiktok',
    platformPostId: item.id,
    url,
    text: item.desc ?? null,
    hashtags,
    publishedAt,
    author: {
      platformAuthorId: item.author?.id ?? null,
      username: username ?? 'unknown',
      displayName: item.author?.nickname ?? null,
      profileUrl: username ? `https://www.tiktok.com/@${username}` : null,
      verified: item.author?.verified ?? null,
    },
    metrics: {
      views: toNumberOrNull(item.stats?.playCount),
      likes: toNumberOrNull(item.stats?.diggCount),
      comments: toNumberOrNull(item.stats?.commentCount),
      shares: toNumberOrNull(item.stats?.shareCount),
      saves: toNumberOrNull(item.stats?.collectCount),
    },
    collectedAt,
    collectionSource: source,
    collectionQuery: query,
    raw: {
      id: item.id,
      text: item.desc ?? null,
      hashtags,
      createTime: item.createTime ?? null,
      createTimeISO: publishedAt,
      webVideoUrl: url,
      diggCount: toNumberOrNull(item.stats?.diggCount),
      playCount: toNumberOrNull(item.stats?.playCount),
      commentCount: toNumberOrNull(item.stats?.commentCount),
      shareCount: toNumberOrNull(item.stats?.shareCount),
      collectCount: toNumberOrNull(item.stats?.collectCount),
      authorMeta: item.author ?? null,
      musicMeta: item.music ?? null,
      videoMeta: item.video ?? null,
      locationMeta: item.locationCreated ?? item.poi ?? null,
    },
  };
}
