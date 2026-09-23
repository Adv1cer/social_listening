import { z } from 'zod';

const booleanString = z.preprocess(
  (value) => (typeof value === 'string' ? value !== 'false' : value),
  z.boolean(),
);

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  COLLECTOR_HEADLESS: booleanString.default(true),
  COLLECTOR_MAX_CONCURRENCY: z.coerce.number().int().positive().default(1),
  COLLECTOR_MAX_REQUESTS_PER_MINUTE: z.coerce.number().int().positive().default(10),
  COLLECTOR_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(120),
  DEFAULT_TARGET_POSTS_PER_QUERY: z.coerce.number().int().positive().default(30),
  DEFAULT_MAX_SCROLLS_PER_QUERY: z.coerce.number().int().positive().default(30),
  DEFAULT_MAX_EMPTY_SCROLLS: z.coerce.number().int().positive().default(3),
  TIKTOK_UTCC_PROFILES: z.string().default(''),
  TIKTOK_BROWSER_PROFILE_DIR: z.string().default('.browser-profile/tiktok'),
  COMMENT_MAX_PER_VIDEO: z.coerce.number().int().positive().default(500),
  REPORT_API_KEY: z.string().default(''),
  APIFY_TOKEN: z.string().default(''),
  APIFY_TIKTOK_ACTOR_ID: z.string().default('clockworks~tiktok-hashtag-scraper'),
});

export interface AppConfig {
  port: number;
  databaseUrl: string;
  nodeEnv: 'development' | 'test' | 'production';
  collector: {
    headless: boolean;
    maxConcurrency: number;
    maxRequestsPerMinute: number;
    timeoutSeconds: number;
  };
  defaults: {
    targetPostsPerQuery: number;
    maxScrollsPerQuery: number;
    maxEmptyScrolls: number;
  };
  tiktok: {
    utccProfiles: string[];
    browserProfileDir: string;
    commentMaxPerVideo: number;
  };
  reports: {
    apiKey: string;
  };
  apify: {
    token: string;
    tiktokActorId: string;
  };
}

export function loadEnv(source: NodeJS.ProcessEnv | Record<string, string | undefined>): AppConfig {
  const parsed = envSchema.parse(source);
  return {
    port: parsed.PORT,
    databaseUrl: parsed.DATABASE_URL,
    nodeEnv: parsed.NODE_ENV,
    collector: {
      headless: parsed.COLLECTOR_HEADLESS,
      maxConcurrency: parsed.COLLECTOR_MAX_CONCURRENCY,
      maxRequestsPerMinute: parsed.COLLECTOR_MAX_REQUESTS_PER_MINUTE,
      timeoutSeconds: parsed.COLLECTOR_TIMEOUT_SECONDS,
    },
    defaults: {
      targetPostsPerQuery: parsed.DEFAULT_TARGET_POSTS_PER_QUERY,
      maxScrollsPerQuery: parsed.DEFAULT_MAX_SCROLLS_PER_QUERY,
      maxEmptyScrolls: parsed.DEFAULT_MAX_EMPTY_SCROLLS,
    },
    tiktok: {
      utccProfiles: parsed.TIKTOK_UTCC_PROFILES.split(',').map((v) => v.trim()).filter((v) => v.length > 0),
      browserProfileDir: parsed.TIKTOK_BROWSER_PROFILE_DIR,
      commentMaxPerVideo: parsed.COMMENT_MAX_PER_VIDEO,
    },
    reports: {
      apiKey: parsed.REPORT_API_KEY,
    },
    apify: {
      token: parsed.APIFY_TOKEN,
      tiktokActorId: parsed.APIFY_TIKTOK_ACTOR_ID,
    },
  };
}
