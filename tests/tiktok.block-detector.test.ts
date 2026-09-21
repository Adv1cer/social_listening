import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { classifyPageState } from '../src/collectors/tiktok/tiktok.block-detector.js';

function fixture(name: string): string {
  return readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf-8');
}

const SEARCH_URL = 'https://www.tiktok.com/search?q=UTCC';

describe('classifyPageState', () => {
  it('does not treat a normal guest navbar "Log in to TikTok" prompt as a block', () => {
    expect(classifyPageState(fixture('tiktok-guest-navbar.html'), SEARCH_URL)).toEqual({ status: 'ok' });
  });

  it('classifies a full-page authentication gate as login_required', () => {
    const result = classifyPageState(fixture('tiktok-login-wall.html'), SEARCH_URL);
    expect(result.status).toBe('login_required');
  });

  it('classifies a CAPTCHA challenge as captcha_required', () => {
    const result = classifyPageState(fixture('tiktok-captcha.html'), SEARCH_URL);
    expect(result.status).toBe('captcha_required');
  });

  it('classifies a generic "Something went wrong" search error as soft_blocked', () => {
    const result = classifyPageState(fixture('tiktok-search-error.html'), SEARCH_URL);
    expect(result.status).toBe('soft_blocked');
  });

  it('classifies a valid search results page as ok', () => {
    const result = classifyPageState(fixture('tiktok-search.html'), SEARCH_URL);
    expect(result.status).toBe('ok');
  });
});
