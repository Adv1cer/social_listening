import { extractHashtags } from '../../utils/hashtag.js';
import { parseMetricValue } from '../../utils/metric.js';
import { toIsoStringOrNull } from '../../utils/date.js';
import type { CollectedPost } from '../../types/social.types.js';
import type { RawTikTokPost } from './tiktok.parser.js';

export function normalizeTikTokPost(raw: RawTikTokPost, collectedAt: string): CollectedPost | null {
  if (!raw.postId || !raw.url) return null;

  return {
    platform: 'tiktok',
    platformPostId: raw.postId,
    url: raw.url,
    text: raw.captionText,
    hashtags: extractHashtags(raw.captionText),
    publishedAt: toIsoStringOrNull(raw.publishedAtRaw),
    author: {
      platformAuthorId: null,
      username: raw.authorUsername ?? 'unknown',
      displayName: raw.authorDisplayName,
      profileUrl: raw.authorProfileUrl,
      verified: null,
    },
    metrics: {
      views: parseMetricValue(raw.viewsRaw),
      likes: parseMetricValue(raw.likesRaw),
      comments: parseMetricValue(raw.commentsRaw),
      shares: parseMetricValue(raw.sharesRaw),
      saves: null,
    },
    collectedAt,
  };
}
