// TODO: VERIFY_WITH_LIVE_TIKTOK
// These selectors are best-effort, based on publicly documented TikTok search
// DOM structure (data-e2e attributes). They have not been validated against
// a live TikTok page in this environment. Verify and adjust before relying on
// them in production, and keep every selector confined to this file.
export const TIKTOK_SELECTORS = {
  searchResultItem: '[data-e2e="search-card-video"], [data-e2e="search_video-item"]',
  postLink: 'a[href*="/video/"]',
  authorUsername: '[data-e2e="search-card-user-unique-id"]',
  authorDisplayName: '[data-e2e="search-card-user-nickname"]',
  authorProfileLink: 'a[href^="https://www.tiktok.com/@"]',
  caption: '[data-e2e="search-card-video-caption"], [data-e2e="new-desc-span"]',
  likeCount: '[data-e2e="search-card-like-count"], strong[data-e2e="like-count"]',
  viewCount: '[data-e2e="search-card-video-views"], strong[data-e2e="video-views"]',
  commentCount: 'strong[data-e2e="comment-count"]',
  shareCount: 'strong[data-e2e="share-count"]',
  publishedTime: 'time',
} as const;

// TODO: VERIFY_WITH_LIVE_TIKTOK
// Text/selector fragments used to detect that TikTok blocked or gated the
// page (CAPTCHA, login wall, rate limiting, access denied, unavailable).
export const TIKTOK_BLOCK_INDICATORS = {
  captchaSelectors: ['#captcha-verify-container', '.captcha_verify_container', 'div[id*="captcha"]'],
  loginWallSelectors: ['[data-e2e="login-title"]', '.login-container'],
  textIndicators: [
    'verify to continue',
    'access denied',
    'too many requests',
    'this video is currently unavailable',
    'log in to tiktok',
  ],
} as const;
