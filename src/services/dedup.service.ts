import type { CollectedPost } from '../types/social.types.js';

export function canonicalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.search = '';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return url.split('?')[0].replace(/\/$/, '');
  }
}

export function getPostIdentityKey(post: Pick<CollectedPost, 'platformPostId' | 'url'>): string {
  return post.platformPostId ? post.platformPostId : canonicalizeUrl(post.url);
}

export class InCollectionDeduper {
  private readonly seen = new Set<string>();

  isDuplicate(post: CollectedPost): boolean {
    const key = getPostIdentityKey(post);
    if (this.seen.has(key)) return true;
    this.seen.add(key);
    return false;
  }
}
