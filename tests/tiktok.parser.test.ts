import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseSearchResultsHtml } from '../src/collectors/tiktok/tiktok.parser.js';

const fixturePath = fileURLToPath(new URL('./fixtures/tiktok-search.html', import.meta.url));
const html = readFileSync(fixturePath, 'utf-8');

describe('parseSearchResultsHtml', () => {
  it('parses each search result card into a RawTikTokPost', () => {
    const posts = parseSearchResultsHtml(html);
    expect(posts).toHaveLength(2);
  });

  it('extracts full metadata from a complete card', () => {
    const [post] = parseSearchResultsHtml(html);
    expect(post.postId).toBe('7123456789012345678');
    expect(post.url).toBe('https://www.tiktok.com/@utccuni/video/7123456789012345678');
    expect(post.authorUsername).toBe('utccuni');
    expect(post.authorDisplayName).toBe('UTCC Official');
    expect(post.captionText).toBe('เรียนที่ #UTCC สนุกมาก');
    expect(post.publishedAtRaw).toBe('2026-09-10T08:00:00.000Z');
    expect(post.likesRaw).toBe('1.2K');
    expect(post.viewsRaw).toBe('10K');
    expect(post.commentsRaw).toBe('45');
    expect(post.sharesRaw).toBe('12');
  });

  it('fills missing fields with null instead of fabricating', () => {
    const [, second] = parseSearchResultsHtml(html);
    expect(second.postId).toBe('7123456789012345679');
    expect(second.authorDisplayName).toBeNull();
    expect(second.publishedAtRaw).toBeNull();
    expect(second.likesRaw).toBeNull();
    expect(second.viewsRaw).toBeNull();
  });

  it('returns an empty array for a page with no result cards', () => {
    expect(parseSearchResultsHtml('<html><body>no results</body></html>')).toEqual([]);
  });
});
