export type Platform = 'tiktok';

export type CollectionSource = 'profile' | 'direct_url' | 'hashtag' | 'keyword';

export interface CollectedAuthor {
  platformAuthorId: string | null;
  username: string;
  displayName: string | null;
  profileUrl: string | null;
  verified: boolean | null;
}

export interface CollectedMetrics {
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
}

export interface CollectedPost {
  platform: Platform;
  platformPostId: string;
  url: string;
  text: string | null;
  hashtags: string[];
  publishedAt: string | null;
  author: CollectedAuthor;
  metrics: CollectedMetrics;
  collectedAt: string;
  collectionSource?: CollectionSource;
  collectionQuery?: string | null;
  raw?: Record<string, unknown> | null;
}
