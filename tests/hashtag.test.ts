import { describe, expect, it } from 'vitest';
import { extractHashtags } from '../src/utils/hashtag.js';

describe('extractHashtags', () => {
  it('extracts hashtags from mixed Thai/English text', () => {
    expect(extractHashtags('สวัสดี #UTCC วันนี้ #มหาวิทยาลัยหอการค้าไทย สนุกมาก')).toEqual([
      'UTCC',
      'มหาวิทยาลัยหอการค้าไทย',
    ]);
  });

  it('dedupes repeated hashtags preserving first-seen order', () => {
    expect(extractHashtags('#UTCC hello #UTCC again')).toEqual(['UTCC']);
  });

  it('returns empty array for text with no hashtags', () => {
    expect(extractHashtags('no tags here')).toEqual([]);
  });

  it('returns empty array for null/undefined', () => {
    expect(extractHashtags(null)).toEqual([]);
    expect(extractHashtags(undefined)).toEqual([]);
  });
});
