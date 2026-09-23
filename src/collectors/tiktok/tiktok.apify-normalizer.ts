import { toNumberOrNull } from '../../utils/metric.js';
import { toIsoStringOrNull } from '../../utils/date.js';
import type { CollectedPost, CollectionSource } from '../../types/social.types.js';

// Shape of a clockworks/tiktok-scraper (and compatible actors') dataset item.
// Fields are optional/defensive because actor output has drifted across
// versions and we'd rather drop a field than throw on a whole batch.
export interface ApifyTikTokItem {
  id?: string;
  text?: string;
  createTime?: number | string;
  createTimeISO?: string;
  webVideoUrl?: string;
  diggCount?: number;
  shareCount?: number;
  playCount?: number;
  commentCount?: number;
  collectCount?: number;
  hashtags?: Array<{ id?: string; name?: string; title?: string }>;
  authorMeta?: {
    id?: string;
    name?: string;
    nickName?: string;
    verified?: boolean;
    [key: string]: unknown;
  };
  musicMeta?: Record<string, unknown>;
  videoMeta?: Record<string, unknown>;
  locationMeta?: unknown;
}

export function normalizeApifyTikTokItem(
  item: ApifyTikTokItem,
  collectedAt: string,
  source: CollectionSource,
  query: string | null,
): CollectedPost | null {
  if (!item.id) return null;

  const username = item.authorMeta?.name ?? null;
  const url = item.webVideoUrl || (username ? `https://www.tiktok.com/@${username}/video/${item.id}` : null);
  if (!url) return null;

  const publishedAt = item.createTimeISO ? toIsoStringOrNull(item.createTimeISO) : toIsoStringOrNull(item.createTime);
  const hashtags = (item.hashtags ?? []).map((h) => h.name).filter((n): n is string => !!n);

  return {
    platform: 'tiktok',
    platformPostId: item.id,
    url,
    text: item.text ?? null,
    hashtags,
    publishedAt,
    author: {
      platformAuthorId: item.authorMeta?.id ?? null,
      username: username ?? 'unknown',
      displayName: item.authorMeta?.nickName ?? null,
      profileUrl: username ? `https://www.tiktok.com/@${username}` : null,
      verified: item.authorMeta?.verified ?? null,
    },
    metrics: {
      views: toNumberOrNull(item.playCount),
      likes: toNumberOrNull(item.diggCount),
      comments: toNumberOrNull(item.commentCount),
      shares: toNumberOrNull(item.shareCount),
      saves: toNumberOrNull(item.collectCount),
    },
    collectedAt,
    collectionSource: source,
    collectionQuery: query,
    raw: {
      id: item.id,
      text: item.text ?? null,
      hashtags,
      createTime: item.createTime ?? null,
      createTimeISO: publishedAt,
      webVideoUrl: url,
      diggCount: toNumberOrNull(item.diggCount),
      playCount: toNumberOrNull(item.playCount),
      commentCount: toNumberOrNull(item.commentCount),
      shareCount: toNumberOrNull(item.shareCount),
      collectCount: toNumberOrNull(item.collectCount),
      authorMeta: item.authorMeta ?? null,
      musicMeta: item.musicMeta ?? null,
      videoMeta: item.videoMeta ?? null,
      locationMeta: item.locationMeta ?? null,
    },
  };
}
