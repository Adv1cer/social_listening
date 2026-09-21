import { TIKTOK_BLOCK_INDICATORS } from './tiktok.selectors.js';

export type PageState =
  | { status: 'ok' }
  | { status: 'captcha_required'; evidence: Record<string, unknown> }
  | { status: 'login_required'; evidence: Record<string, unknown> }
  | { status: 'soft_blocked'; evidence: Record<string, unknown> };

function selectorToSubstring(selector: string): string {
  if (selector.startsWith('[') && selector.endsWith(']')) return selector.slice(1, -1);
  return selector.replace(/^[.#]/, '');
}

function hasAny(html: string, selectors: readonly string[]): boolean {
  return selectors.some((s) => html.includes(selectorToSubstring(s)));
}

// TODO: VERIFY_WITH_LIVE_TIKTOK
// "Log in to TikTok" appears in TikTok's normal guest-mode navbar on every
// anonymous page load — it is NOT evidence of a login wall by itself.
// A real login wall requires a stronger signal: the URL was redirected to a
// login route, or the page presents an actual credential form (a password
// input) with no sign of ordinary search/browse UI.
export function classifyPageState(html: string, url: string): PageState {
  const lower = html.toLowerCase();

  if (hasAny(html, TIKTOK_BLOCK_INDICATORS.captchaSelectors)) {
    return { status: 'captcha_required', evidence: { captchaDetected: true } };
  }

  const urlLooksLikeLogin = /\/login(\/|$|\?)/.test(url);
  const hasPasswordInput = html.includes('type="password"');
  const hasLoginWallMarker = hasAny(html, TIKTOK_BLOCK_INDICATORS.loginWallSelectors);
  const hasSearchOrBrowseUi = html.includes('data-e2e="search') || html.includes('data-e2e="browse');
  if (urlLooksLikeLogin || ((hasPasswordInput || hasLoginWallMarker) && !hasSearchOrBrowseUi)) {
    return {
      status: 'login_required',
      evidence: { urlLooksLikeLogin, hasPasswordInput, hasLoginWallMarker, hasSearchOrBrowseUi },
    };
  }

  if (html.includes('data-e2e="search-error-title"') || html.includes('data-e2e="search-error-desc"')) {
    return { status: 'soft_blocked', evidence: { searchErrorDetected: true } };
  }

  for (const indicator of TIKTOK_BLOCK_INDICATORS.textIndicators) {
    if (indicator === 'log in to tiktok') continue; // known false positive, see comment above
    if (lower.includes(indicator)) {
      return { status: 'soft_blocked', evidence: { textIndicator: indicator } };
    }
  }

  return { status: 'ok' };
}
