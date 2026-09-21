const HASHTAG_RE = /#([\p{L}\p{M}\p{N}_]+)/gu;

export function extractHashtags(text: string | null | undefined): string[] {
  if (!text) return [];
  const tags: string[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(HASHTAG_RE)) {
    const tag = match[1];
    if (!seen.has(tag)) {
      seen.add(tag);
      tags.push(tag);
    }
  }
  return tags;
}
