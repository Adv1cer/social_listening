import type { CollectedPost } from '../types/social.types.js';

export interface CollectorInput {
  query: string;
  targetPosts: number;
  maxScrolls: number;
  maxCollectionTimeSeconds: number;
  maxConsecutiveEmptyScrolls: number;
}

export type StopReason =
  | 'target_reached'
  | 'no_more_results'
  | 'empty_scroll_limit'
  | 'scroll_limit'
  | 'timeout'
  | 'blocked'
  | 'captcha'
  | 'session_expired'
  | 'incomplete'
  | 'error';

export interface CollectorResult {
  posts: CollectedPost[];
  scannedCount: number;
  returnedCount: number;
  targetPosts: number;
  targetReached: boolean;
  stopReason: StopReason;
}
