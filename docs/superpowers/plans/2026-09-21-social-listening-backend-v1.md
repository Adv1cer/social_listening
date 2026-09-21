# Social Listening Backend V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-hosted backend that collects public TikTok data via Crawlee+Playwright, normalizes/dedupes it into PostgreSQL as historical data, and exposes Collection/Posts/Runs/Analytics APIs for an external Agentflow orchestrator.

**Architecture:** Fastify HTTP layer → Collection Service → TikTok Collector (Crawlee/Playwright, wrapping a pure target/overshoot collection loop) → Parser (cheerio, fixture-testable) → Normalizer → Dedup → Repositories (Prisma) → PostgreSQL. Analytics computed in-process from stored rows, never by an LLM.

**Tech Stack:** Node.js 24, TypeScript (ESM/NodeNext), Fastify, Crawlee, Playwright (Chromium), Prisma ORM, PostgreSQL 17, Zod, cheerio, pino, Docker/Docker Compose, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-21-social-listening-backend-v1-design.md`

## Global Constraints

- No Apify, no paid scraping API, no paid proxy, no scraping SaaS, no TikTok Research API.
- Public data only — no login bypass, no CAPTCHA bypass, no access-control bypass, no fabricated data.
- Missing field → `null`, never omitted or invented.
- PostgreSQL only — no MySQL.
- `targetPostsPerQuery` / `targetTotalPosts` are desired minimums, never hard caps — the last batch that crosses the target is returned in full, never sliced.
- `rawMetadata` must never contain cookies, tokens, credentials, sessions, or full-page HTML.
- Automated tests must never hit live TikTok — use fixtures/fakes only. `npm run collector:test` is the only live-TikTok entry point, and it's manual/opt-in.
- All TikTok DOM selectors live only in `tiktok.selectors.ts`; unverified ones carry `TODO: VERIFY_WITH_LIVE_TIKTOK`.
- Collector defaults: headless=true, maxConcurrency=1, maxRequestRetries=2, navigationTimeoutSecs=30, requestHandlerTimeoutSecs=150, maxRequestsPerMinute=10.

---

### Task 1: Project Scaffold & Docker

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `.env.example`, `Dockerfile`, `docker-compose.yml`

**Interfaces:**
- Produces: an installable, buildable, test-runnable Node/TS project; a `postgres` service reachable at `localhost:5432` with database `social_listening`.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "social-listening",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=24" },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "tsx watch src/server.ts",
    "start": "node dist/server.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev",
    "collector:test": "tsx scripts/test-tiktok-collector.ts"
  },
  "dependencies": {
    "@prisma/client": "^6.5.0",
    "cheerio": "^1.0.0",
    "crawlee": "^3.13.0",
    "fastify": "^5.2.0",
    "pino": "^9.6.0",
    "playwright": "^1.50.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "prisma": "^6.5.0",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "sourceMap": true,
    "resolveJsonModule": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
```

- [ ] **Step 4: Create `.gitignore`**

```
node_modules/
dist/
.env
*.log
generated/
coverage/
```

- [ ] **Step 5: Create `.env.example`**

```
PORT=8000
DATABASE_URL=postgresql://social:password@localhost:5432/social_listening
NODE_ENV=development
COLLECTOR_HEADLESS=true
COLLECTOR_MAX_CONCURRENCY=1
COLLECTOR_MAX_REQUESTS_PER_MINUTE=10
COLLECTOR_TIMEOUT_SECONDS=120
DEFAULT_TARGET_POSTS_PER_QUERY=30
DEFAULT_MAX_SCROLLS_PER_QUERY=30
DEFAULT_MAX_EMPTY_SCROLLS=3
```

- [ ] **Step 6: Create `docker-compose.yml`**

```yaml
services:
  postgres:
    image: postgres:17
    container_name: social_listening_postgres
    environment:
      POSTGRES_DB: social_listening
      POSTGRES_USER: social
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-password}
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U social -d social_listening"]
      interval: 5s
      timeout: 5s
      retries: 10

volumes:
  postgres_data:
```

- [ ] **Step 7: Create `Dockerfile`**

```dockerfile
FROM node:24-slim AS base
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npx prisma generate
RUN npm run build
RUN npx playwright install --with-deps chromium
EXPOSE 8000
CMD ["node", "dist/server.js"]
```

- [ ] **Step 8: Install and verify**

Run: `npm install`
Expected: installs cleanly, creates `package-lock.json`.

Run: `docker compose up -d postgres`
Expected: container starts; `docker compose ps` shows `healthy` within ~15s.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .gitignore .env.example Dockerfile docker-compose.yml
git commit -m "chore: scaffold project, tooling, and postgres docker-compose"
```

---

### Task 2: Prisma Schema & Migration

**Files:**
- Create: `prisma/schema.prisma`

**Interfaces:**
- Produces: `SocialAuthor`, `SocialPost`, `SocialMetric`, `CollectionRun` Prisma models and generated `@prisma/client` types, consumed by every repository task.

- [ ] **Step 1: Write `prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model SocialAuthor {
  id               String    @id @default(cuid())
  platform         String
  platformAuthorId String?
  username         String
  displayName      String?
  profileUrl       String?
  verified         Boolean?
  firstSeenAt      DateTime  @default(now())
  lastSeenAt       DateTime  @default(now())
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt
  posts            SocialPost[]

  @@unique([platform, platformAuthorId])
  @@index([platform])
}

model SocialPost {
  id             String         @id @default(cuid())
  platform       String
  platformPostId String
  url            String
  authorId       String?
  author         SocialAuthor?  @relation(fields: [authorId], references: [id])
  text           String?
  hashtags       Json           @default("[]")
  publishedAt    DateTime?
  firstSeenAt    DateTime       @default(now())
  lastSeenAt     DateTime       @default(now())
  rawMetadata    Json?
  createdAt      DateTime       @default(now())
  updatedAt      DateTime       @updatedAt
  metrics        SocialMetric[]

  @@unique([platform, platformPostId])
  @@index([platform])
  @@index([publishedAt])
  @@index([firstSeenAt])
  @@index([lastSeenAt])
}

model SocialMetric {
  id         String     @id @default(cuid())
  postId     String
  post       SocialPost @relation(fields: [postId], references: [id])
  views      Int?
  likes      Int?
  comments   Int?
  shares     Int?
  saves      Int?
  capturedAt DateTime   @default(now())
  createdAt  DateTime   @default(now())

  @@index([postId])
  @@index([capturedAt])
}

model CollectionRun {
  id           String    @id @default(cuid())
  platform     String
  queryType    String
  queryValue   String
  targetPosts  Int
  startedAt    DateTime  @default(now())
  finishedAt   DateTime?
  scannedCount Int       @default(0)
  foundCount   Int       @default(0)
  newCount     Int       @default(0)
  updatedCount Int       @default(0)
  failedCount  Int       @default(0)
  stopReason   String?
  status       String
  errorCode    String?
  errorMessage String?
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  @@index([platform])
  @@index([status])
}
```

- [ ] **Step 2: Generate client and migrate**

Ensure `.env` exists (copy from `.env.example`) and `docker compose up -d postgres` is healthy (Task 1).

Run: `cp .env.example .env` (adjust `DATABASE_URL` password if needed)
Run: `npx prisma generate`
Expected: "Generated Prisma Client" success message.

Run: `npx prisma migrate dev --name init`
Expected: migration applied, tables created in `social_listening` database.

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma prisma/migrations .env.example
git commit -m "feat: add Prisma schema for authors, posts, metrics, collection runs"
```

---

### Task 3: Env Config Loader

**Files:**
- Create: `src/config/env.ts`
- Test: `tests/env.test.ts`

**Interfaces:**
- Produces: `loadEnv(source: NodeJS.ProcessEnv): AppConfig` and `AppConfig` type — consumed by `src/server.ts` (Task 18) and `TikTokCollector` (Task 12) for collector defaults.

- [ ] **Step 1: Write the failing test**

```ts
// tests/env.test.ts
import { describe, expect, it } from 'vitest';
import { loadEnv } from '../src/config/env.js';

describe('loadEnv', () => {
  it('parses required and defaulted values', () => {
    const config = loadEnv({
      DATABASE_URL: 'postgresql://social:password@localhost:5432/social_listening',
    });

    expect(config.port).toBe(8000);
    expect(config.databaseUrl).toBe('postgresql://social:password@localhost:5432/social_listening');
    expect(config.nodeEnv).toBe('development');
    expect(config.collector.headless).toBe(true);
    expect(config.collector.maxConcurrency).toBe(1);
    expect(config.collector.maxRequestsPerMinute).toBe(10);
    expect(config.collector.timeoutSeconds).toBe(120);
    expect(config.defaults.targetPostsPerQuery).toBe(30);
    expect(config.defaults.maxScrollsPerQuery).toBe(30);
    expect(config.defaults.maxEmptyScrolls).toBe(3);
  });

  it('throws when DATABASE_URL is missing', () => {
    expect(() => loadEnv({})).toThrow();
  });

  it('honors overrides', () => {
    const config = loadEnv({
      DATABASE_URL: 'postgresql://x',
      PORT: '9000',
      COLLECTOR_HEADLESS: 'false',
    });
    expect(config.port).toBe(9000);
    expect(config.collector.headless).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/env.test.ts`
Expected: FAIL — `src/config/env.ts` does not exist.

- [ ] **Step 3: Write `src/config/env.ts`**

```ts
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  COLLECTOR_HEADLESS: z.coerce.boolean().default(true),
  COLLECTOR_MAX_CONCURRENCY: z.coerce.number().int().positive().default(1),
  COLLECTOR_MAX_REQUESTS_PER_MINUTE: z.coerce.number().int().positive().default(10),
  COLLECTOR_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(120),
  DEFAULT_TARGET_POSTS_PER_QUERY: z.coerce.number().int().positive().default(30),
  DEFAULT_MAX_SCROLLS_PER_QUERY: z.coerce.number().int().positive().default(30),
  DEFAULT_MAX_EMPTY_SCROLLS: z.coerce.number().int().positive().default(3),
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
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/env.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/config/env.ts tests/env.test.ts
git commit -m "feat: add zod-validated env config loader"
```

---

### Task 4: Metric String Parser

**Files:**
- Create: `src/utils/metric.ts`
- Test: `tests/metric.test.ts`

**Interfaces:**
- Produces: `parseMetricValue(raw: string | null | undefined): number | null` — consumed by `tiktok.normalizer.ts` (Task 11).

- [ ] **Step 1: Write the failing test**

```ts
// tests/metric.test.ts
import { describe, expect, it } from 'vitest';
import { parseMetricValue } from '../src/utils/metric.js';

describe('parseMetricValue', () => {
  it.each([
    ['100', 100],
    ['1K', 1000],
    ['1.2K', 1200],
    ['10K', 10000],
    ['1M', 1000000],
    ['1.5M', 1500000],
    ['1B', 1000000000],
    ['2,345', 2345],
  ])('parses %s as %i', (input, expected) => {
    expect(parseMetricValue(input)).toBe(expected);
  });

  it.each([[''], [null], [undefined], ['abc'], ['--']])('returns null for %s', (input) => {
    expect(parseMetricValue(input as string | null | undefined)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/metric.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/utils/metric.ts`**

```ts
const SUFFIX_MULTIPLIERS: Record<string, number> = {
  '': 1,
  K: 1_000,
  M: 1_000_000,
  B: 1_000_000_000,
};

export function parseMetricValue(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const trimmed = raw.trim().replace(/,/g, '');
  if (trimmed === '') return null;

  const match = /^(\d+(?:\.\d+)?)([KMB]?)$/i.exec(trimmed);
  if (!match) return null;

  const [, numberPart, suffixPart] = match;
  const value = Number(numberPart);
  if (Number.isNaN(value)) return null;

  const multiplier = SUFFIX_MULTIPLIERS[suffixPart.toUpperCase()];
  return Math.round(value * multiplier);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/metric.test.ts`
Expected: PASS (13 tests)

- [ ] **Step 5: Commit**

```bash
git add src/utils/metric.ts tests/metric.test.ts
git commit -m "feat: add TikTok metric string parser (1.2K -> 1200 style)"
```

---

### Task 5: Hashtag Extraction

**Files:**
- Create: `src/utils/hashtag.ts`
- Test: `tests/hashtag.test.ts`

**Interfaces:**
- Produces: `extractHashtags(text: string | null | undefined): string[]` — consumed by `tiktok.normalizer.ts` (Task 11).

- [ ] **Step 1: Write the failing test**

```ts
// tests/hashtag.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/hashtag.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/utils/hashtag.ts`**

```ts
const HASHTAG_RE = /#([\p{L}\p{N}_]+)/gu;

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/hashtag.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/utils/hashtag.ts tests/hashtag.test.ts
git commit -m "feat: add hashtag extraction util"
```

---

### Task 6: Date, Errors, Logger Utils

**Files:**
- Create: `src/utils/date.ts`, `src/utils/errors.ts`, `src/utils/logger.ts`
- Test: `tests/date.test.ts`, `tests/errors.test.ts`

**Interfaces:**
- Produces: `toIsoStringOrNull(value: unknown): string | null`, `nowIso(): string`, `class CollectorBlockedError extends Error { reason: string }`, `class AppError extends Error { statusCode: number; code: string }`, `logger` (pino instance) — consumed throughout collector, services, and routes.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/date.test.ts
import { describe, expect, it } from 'vitest';
import { toIsoStringOrNull, nowIso } from '../src/utils/date.js';

describe('date utils', () => {
  it('converts a valid date-like value to ISO string', () => {
    expect(toIsoStringOrNull('2026-09-21T00:00:00.000Z')).toBe('2026-09-21T00:00:00.000Z');
  });

  it('returns null for invalid or missing input', () => {
    expect(toIsoStringOrNull(null)).toBeNull();
    expect(toIsoStringOrNull(undefined)).toBeNull();
    expect(toIsoStringOrNull('not-a-date')).toBeNull();
  });

  it('nowIso returns a parseable ISO string', () => {
    expect(Number.isNaN(Date.parse(nowIso()))).toBe(false);
  });
});
```

```ts
// tests/errors.test.ts
import { describe, expect, it } from 'vitest';
import { AppError, CollectorBlockedError } from '../src/utils/errors.js';

describe('errors', () => {
  it('CollectorBlockedError carries a reason and name', () => {
    const err = new CollectorBlockedError('captcha');
    expect(err.name).toBe('CollectorBlockedError');
    expect(err.reason).toBe('captcha');
    expect(err.message).toContain('captcha');
  });

  it('AppError carries statusCode and code', () => {
    const err = new AppError(404, 'NOT_FOUND', 'Post not found');
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toBe('Post not found');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/date.test.ts tests/errors.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write `src/utils/date.ts`**

```ts
export function toIsoStringOrNull(value: unknown): string | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function nowIso(): string {
  return new Date().toISOString();
}
```

- [ ] **Step 4: Write `src/utils/errors.ts`**

```ts
export class CollectorBlockedError extends Error {
  constructor(public readonly reason: string) {
    super(`Collector blocked: ${reason}`);
    this.name = 'CollectorBlockedError';
  }
}

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
```

- [ ] **Step 5: Write `src/utils/logger.ts`**

```ts
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
});
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/date.test.ts tests/errors.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 7: Commit**

```bash
git add src/utils/date.ts src/utils/errors.ts src/utils/logger.ts tests/date.test.ts tests/errors.test.ts
git commit -m "feat: add date, error, and logger utils"
```

---

### Task 7: Shared Types & Collector Interface

**Files:**
- Create: `src/types/social.types.ts`, `src/collectors/collector.types.ts`, `src/collectors/collector.interface.ts`

**Interfaces:**
- Produces: `Platform`, `CollectedAuthor`, `CollectedMetrics`, `CollectedPost` (`social.types.ts`); `CollectorInput`, `StopReason`, `CollectorResult` (`collector.types.ts`); `SocialCollector` interface — consumed by every collector/service/repository task below.

- [ ] **Step 1: Write `src/types/social.types.ts`**

```ts
export type Platform = 'tiktok';

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
}
```

- [ ] **Step 2: Write `src/collectors/collector.types.ts`**

```ts
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
  | 'error';

export interface CollectorResult {
  posts: CollectedPost[];
  scannedCount: number;
  returnedCount: number;
  targetPosts: number;
  targetReached: boolean;
  stopReason: StopReason;
}
```

- [ ] **Step 3: Write `src/collectors/collector.interface.ts`**

```ts
import type { CollectorInput, CollectorResult } from './collector.types.js';

export interface SocialCollector {
  collect(input: CollectorInput): Promise<CollectorResult>;
}
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/types/social.types.ts src/collectors/collector.types.ts src/collectors/collector.interface.ts
git commit -m "feat: add shared collected-post types and SocialCollector interface"
```

---

### Task 8: In-Collection Dedup Service

**Files:**
- Create: `src/services/dedup.service.ts`
- Test: `tests/dedup.test.ts`

**Interfaces:**
- Consumes: `CollectedPost` from `src/types/social.types.ts` (Task 7).
- Produces: `canonicalizeUrl(url: string): string`, `getPostIdentityKey(post: Pick<CollectedPost,'platformPostId'|'url'>): string`, `class InCollectionDeduper { isDuplicate(post: CollectedPost): boolean }` — consumed by the collection loop (Task 12).

- [ ] **Step 1: Write the failing test**

```ts
// tests/dedup.test.ts
import { describe, expect, it } from 'vitest';
import { InCollectionDeduper, canonicalizeUrl, getPostIdentityKey } from '../src/services/dedup.service.js';
import type { CollectedPost } from '../src/types/social.types.js';

function makePost(overrides: Partial<CollectedPost> = {}): CollectedPost {
  return {
    platform: 'tiktok',
    platformPostId: '123',
    url: 'https://www.tiktok.com/@user/video/123',
    text: null,
    hashtags: [],
    publishedAt: null,
    author: { platformAuthorId: null, username: 'user', displayName: null, profileUrl: null, verified: null },
    metrics: { views: null, likes: null, comments: null, shares: null, saves: null },
    collectedAt: '2026-09-21T00:00:00.000Z',
    ...overrides,
  };
}

describe('canonicalizeUrl', () => {
  it('strips query string and trailing slash', () => {
    expect(canonicalizeUrl('https://www.tiktok.com/@user/video/123/?foo=bar')).toBe(
      'https://www.tiktok.com/@user/video/123',
    );
  });
});

describe('getPostIdentityKey', () => {
  it('prefers platformPostId', () => {
    expect(getPostIdentityKey({ platformPostId: '123', url: 'https://x/123' })).toBe('123');
  });

  it('falls back to canonical URL when platformPostId is empty', () => {
    expect(getPostIdentityKey({ platformPostId: '', url: 'https://x/123/?a=1' })).toBe('https://x/123');
  });
});

describe('InCollectionDeduper', () => {
  it('reports the first occurrence as unique and repeats as duplicates', () => {
    const deduper = new InCollectionDeduper();
    expect(deduper.isDuplicate(makePost({ platformPostId: '1' }))).toBe(false);
    expect(deduper.isDuplicate(makePost({ platformPostId: '2' }))).toBe(false);
    expect(deduper.isDuplicate(makePost({ platformPostId: '1' }))).toBe(true);
  });

  it('treats same URL with no platformPostId as duplicate', () => {
    const deduper = new InCollectionDeduper();
    const post = makePost({ platformPostId: '', url: 'https://www.tiktok.com/@user/video/999' });
    expect(deduper.isDuplicate(post)).toBe(false);
    expect(deduper.isDuplicate({ ...post, url: 'https://www.tiktok.com/@user/video/999?x=1' })).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/dedup.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/services/dedup.service.ts`**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/dedup.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/services/dedup.service.ts tests/dedup.test.ts
git commit -m "feat: add in-collection dedup service (post identity by id or canonical url)"
```

---

### Task 9: TikTok Selectors

**Files:**
- Create: `src/collectors/tiktok/tiktok.selectors.ts`

**Interfaces:**
- Produces: `TIKTOK_SELECTORS` const — consumed by `tiktok.parser.ts` (Task 10) and block detection in `tiktok.collector.ts` (Task 12).

- [ ] **Step 1: Write `src/collectors/tiktok/tiktok.selectors.ts`**

```ts
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
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/collectors/tiktok/tiktok.selectors.ts
git commit -m "feat: add TikTok DOM selectors and block indicators (unverified, marked TODO)"
```

---

### Task 10: TikTok Parser

**Files:**
- Create: `src/collectors/tiktok/tiktok.parser.ts`, `tests/fixtures/tiktok-search.html`
- Test: `tests/tiktok.parser.test.ts`

**Interfaces:**
- Consumes: `TIKTOK_SELECTORS` (Task 9).
- Produces: `interface RawTikTokPost { postId: string|null; url: string|null; captionText: string|null; publishedAtRaw: string|null; authorUsername: string|null; authorDisplayName: string|null; authorProfileUrl: string|null; viewsRaw: string|null; likesRaw: string|null; commentsRaw: string|null; sharesRaw: string|null }`, `parseSearchResultsHtml(html: string): RawTikTokPost[]` — consumed by `tiktok.normalizer.ts` (Task 11) and the collector's Playwright batch loader (Task 12).

- [ ] **Step 1: Write the fixture HTML**

```html
<!-- tests/fixtures/tiktok-search.html -->
<html>
<body>
  <div data-e2e="search-card-video">
    <a href="https://www.tiktok.com/@utccuni/video/7123456789012345678">video</a>
    <a href="https://www.tiktok.com/@utccuni">profile</a>
    <span data-e2e="search-card-user-unique-id">utccuni</span>
    <span data-e2e="search-card-user-nickname">UTCC Official</span>
    <div data-e2e="search-card-video-caption">เรียนที่ #UTCC สนุกมาก</div>
    <time datetime="2026-09-10T08:00:00.000Z">2026-09-10</time>
    <strong data-e2e="like-count">1.2K</strong>
    <strong data-e2e="video-views">10K</strong>
    <strong data-e2e="comment-count">45</strong>
    <strong data-e2e="share-count">12</strong>
  </div>
  <div data-e2e="search-card-video">
    <a href="https://www.tiktok.com/@student2/video/7123456789012345679">video</a>
    <span data-e2e="search-card-user-unique-id">student2</span>
    <div data-e2e="search-card-video-caption">no metrics here</div>
  </div>
</body>
</html>
```

- [ ] **Step 2: Write the failing test**

```ts
// tests/tiktok.parser.test.ts
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/tiktok.parser.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Write `src/collectors/tiktok/tiktok.parser.ts`**

```ts
import * as cheerio from 'cheerio';
import { TIKTOK_SELECTORS } from './tiktok.selectors.js';

export interface RawTikTokPost {
  postId: string | null;
  url: string | null;
  captionText: string | null;
  publishedAtRaw: string | null;
  authorUsername: string | null;
  authorDisplayName: string | null;
  authorProfileUrl: string | null;
  viewsRaw: string | null;
  likesRaw: string | null;
  commentsRaw: string | null;
  sharesRaw: string | null;
}

function textOrNull(value: string | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function extractPostId(url: string | null): string | null {
  if (!url) return null;
  const match = /\/video\/(\d+)/.exec(url);
  return match ? match[1] : null;
}

export function parseSearchResultsHtml(html: string): RawTikTokPost[] {
  const $ = cheerio.load(html);
  const cards = $(TIKTOK_SELECTORS.searchResultItem);

  return cards
    .map((_, el) => {
      const card = $(el);
      const url = textOrNull(card.find(TIKTOK_SELECTORS.postLink).first().attr('href')) ?? null;

      return {
        postId: extractPostId(url),
        url,
        captionText: textOrNull(card.find(TIKTOK_SELECTORS.caption).first().text()),
        publishedAtRaw: textOrNull(card.find(TIKTOK_SELECTORS.publishedTime).first().attr('datetime')),
        authorUsername: textOrNull(card.find(TIKTOK_SELECTORS.authorUsername).first().text()),
        authorDisplayName: textOrNull(card.find(TIKTOK_SELECTORS.authorDisplayName).first().text()),
        authorProfileUrl: textOrNull(card.find(TIKTOK_SELECTORS.authorProfileLink).first().attr('href')),
        viewsRaw: textOrNull(card.find(TIKTOK_SELECTORS.viewCount).first().text()),
        likesRaw: textOrNull(card.find(TIKTOK_SELECTORS.likeCount).first().text()),
        commentsRaw: textOrNull(card.find(TIKTOK_SELECTORS.commentCount).first().text()),
        sharesRaw: textOrNull(card.find(TIKTOK_SELECTORS.shareCount).first().text()),
      } satisfies RawTikTokPost;
    })
    .get();
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/tiktok.parser.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add src/collectors/tiktok/tiktok.parser.ts tests/tiktok.parser.test.ts tests/fixtures/tiktok-search.html
git commit -m "feat: add TikTok search results HTML parser (fixture-tested, no live calls)"
```

---

### Task 11: TikTok Normalizer

**Files:**
- Create: `src/collectors/tiktok/tiktok.normalizer.ts`
- Test: `tests/tiktok.normalizer.test.ts`

**Interfaces:**
- Consumes: `RawTikTokPost` (Task 10), `parseMetricValue` (Task 4), `extractHashtags` (Task 5), `toIsoStringOrNull` (Task 6), `CollectedPost` (Task 7).
- Produces: `normalizeTikTokPost(raw: RawTikTokPost, collectedAt: string): CollectedPost | null` — consumed by the collector's Playwright batch loader (Task 12).

- [ ] **Step 1: Write the failing test**

```ts
// tests/tiktok.normalizer.test.ts
import { describe, expect, it } from 'vitest';
import { normalizeTikTokPost } from '../src/collectors/tiktok/tiktok.normalizer.js';
import type { RawTikTokPost } from '../src/collectors/tiktok/tiktok.parser.js';

const base: RawTikTokPost = {
  postId: '7123456789012345678',
  url: 'https://www.tiktok.com/@utccuni/video/7123456789012345678',
  captionText: 'เรียนที่ #UTCC สนุกมาก',
  publishedAtRaw: '2026-09-10T08:00:00.000Z',
  authorUsername: 'utccuni',
  authorDisplayName: 'UTCC Official',
  authorProfileUrl: 'https://www.tiktok.com/@utccuni',
  viewsRaw: '10K',
  likesRaw: '1.2K',
  commentsRaw: '45',
  sharesRaw: '12',
};

describe('normalizeTikTokPost', () => {
  it('maps a fully-populated raw post to CollectedPost', () => {
    const post = normalizeTikTokPost(base, '2026-09-21T00:00:00.000Z');
    expect(post).toEqual({
      platform: 'tiktok',
      platformPostId: '7123456789012345678',
      url: 'https://www.tiktok.com/@utccuni/video/7123456789012345678',
      text: 'เรียนที่ #UTCC สนุกมาก',
      hashtags: ['UTCC'],
      publishedAt: '2026-09-10T08:00:00.000Z',
      author: {
        platformAuthorId: null,
        username: 'utccuni',
        displayName: 'UTCC Official',
        profileUrl: 'https://www.tiktok.com/@utccuni',
        verified: null,
      },
      metrics: { views: 10000, likes: 1200, comments: 45, shares: 12, saves: null },
      collectedAt: '2026-09-21T00:00:00.000Z',
    });
  });

  it('fills missing fields with null rather than fabricating', () => {
    const post = normalizeTikTokPost(
      { ...base, publishedAtRaw: null, authorDisplayName: null, viewsRaw: null },
      '2026-09-21T00:00:00.000Z',
    );
    expect(post?.publishedAt).toBeNull();
    expect(post?.author.displayName).toBeNull();
    expect(post?.metrics.views).toBeNull();
  });

  it('returns null when postId or url is missing (unusable card)', () => {
    expect(normalizeTikTokPost({ ...base, postId: null }, '2026-09-21T00:00:00.000Z')).toBeNull();
    expect(normalizeTikTokPost({ ...base, url: null }, '2026-09-21T00:00:00.000Z')).toBeNull();
  });

  it('defaults username to "unknown" when absent, never fabricating a real name', () => {
    const post = normalizeTikTokPost({ ...base, authorUsername: null }, '2026-09-21T00:00:00.000Z');
    expect(post?.author.username).toBe('unknown');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/tiktok.normalizer.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/collectors/tiktok/tiktok.normalizer.ts`**

```ts
import { extractHashtags } from '../../utils/hashtag.js';
import { parseMetricValue } from '../../utils/metric.js';
import { toIsoStringOrNull } from '../../utils/date.js';
import type { CollectedPost } from '../../types/social.types.js';
import type { RawTikTokPost } from './tiktok.parser.js';

export function normalizeTikTokPost(raw: RawTikTokPost, collectedAt: string): CollectedPost | null {
  if (!raw.postId || !raw.url) return null;

  return {
    platform: 'tiktok',
    platformPostId: raw.postId,
    url: raw.url,
    text: raw.captionText,
    hashtags: extractHashtags(raw.captionText),
    publishedAt: toIsoStringOrNull(raw.publishedAtRaw),
    author: {
      platformAuthorId: null,
      username: raw.authorUsername ?? 'unknown',
      displayName: raw.authorDisplayName,
      profileUrl: raw.authorProfileUrl,
      verified: null,
    },
    metrics: {
      views: parseMetricValue(raw.viewsRaw),
      likes: parseMetricValue(raw.likesRaw),
      comments: parseMetricValue(raw.commentsRaw),
      shares: parseMetricValue(raw.sharesRaw),
      saves: null,
    },
    collectedAt,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/tiktok.normalizer.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/collectors/tiktok/tiktok.normalizer.ts tests/tiktok.normalizer.test.ts
git commit -m "feat: add TikTok raw-to-CollectedPost normalizer"
```

---

### Task 12: TikTok Collection Loop + Collector

**Files:**
- Create: `src/collectors/tiktok/tiktok.collector.ts`, `src/collectors/tiktok/tiktok.urls.ts`
- Test: `tests/tiktok.collector.test.ts`

**Interfaces:**
- Consumes: `SocialCollector`, `CollectorInput`, `CollectorResult`, `StopReason` (Task 7), `InCollectionDeduper` (Task 8), `TIKTOK_SELECTORS`, `TIKTOK_BLOCK_INDICATORS` (Task 9), `parseSearchResultsHtml` (Task 10), `normalizeTikTokPost` (Task 11), `CollectorBlockedError` (Task 6).
- Produces: `type BatchResult = { type: 'posts'; posts: CollectedPost[] } | { type: 'empty' } | { type: 'blocked'; reason: string } | { type: 'error'; message: string }`, `interface BatchLoader { loadNextBatch(): Promise<BatchResult> }`, `runCollectionLoop(input: CollectorInput, loader: BatchLoader): Promise<CollectorResult>` (pure, unit-tested here without Playwright), `class TikTokCollector implements SocialCollector` (wires a real Crawlee/Playwright-backed `BatchLoader` into `runCollectionLoop` — exercised only by the manual script in Task 19, not by automated tests), `buildTikTokSearchUrl(query: string): string` in `tiktok.urls.ts`.

- [ ] **Step 1: Write the failing test for the pure loop**

```ts
// tests/tiktok.collector.test.ts
import { describe, expect, it } from 'vitest';
import { runCollectionLoop, type BatchLoader, type BatchResult } from '../src/collectors/tiktok/tiktok.collector.js';
import type { CollectorInput } from '../src/collectors/collector.types.js';
import type { CollectedPost } from '../src/types/social.types.js';

function makePosts(ids: string[]): CollectedPost[] {
  return ids.map((id) => ({
    platform: 'tiktok',
    platformPostId: id,
    url: `https://www.tiktok.com/@u/video/${id}`,
    text: null,
    hashtags: [],
    publishedAt: null,
    author: { platformAuthorId: null, username: 'u', displayName: null, profileUrl: null, verified: null },
    metrics: { views: null, likes: null, comments: null, shares: null, saves: null },
    collectedAt: '2026-09-21T00:00:00.000Z',
  }));
}

function scriptedLoader(batches: BatchResult[]): BatchLoader {
  let i = 0;
  return {
    async loadNextBatch() {
      const batch = batches[Math.min(i, batches.length - 1)];
      i += 1;
      return batch;
    },
  };
}

const baseInput: CollectorInput = {
  query: 'UTCC',
  targetPosts: 30,
  maxScrolls: 30,
  maxCollectionTimeSeconds: 120,
  maxConsecutiveEmptyScrolls: 3,
};

describe('runCollectionLoop', () => {
  it('never truncates the batch that crosses the target (12+13+11 -> 36, not 30)', async () => {
    const loader = scriptedLoader([
      { type: 'posts', posts: makePosts(Array.from({ length: 12 }, (_, i) => `p${i}`)) },
      { type: 'posts', posts: makePosts(Array.from({ length: 13 }, (_, i) => `p${12 + i}`)) },
      { type: 'posts', posts: makePosts(Array.from({ length: 11 }, (_, i) => `p${25 + i}`)) },
      { type: 'empty' },
    ]);

    const result = await runCollectionLoop(baseInput, loader);

    expect(result.returnedCount).toBe(36);
    expect(result.posts).toHaveLength(36);
    expect(result.targetReached).toBe(true);
    expect(result.stopReason).toBe('target_reached');
  });

  it('returns fewer than target when TikTok has no more results, without fabricating', async () => {
    const loader = scriptedLoader([
      { type: 'posts', posts: makePosts(Array.from({ length: 47 }, (_, i) => `p${i}`)) },
      { type: 'empty' },
    ]);

    const result = await runCollectionLoop({ ...baseInput, targetPosts: 100 }, loader);

    expect(result.returnedCount).toBe(47);
    expect(result.targetReached).toBe(false);
    expect(result.stopReason).toBe('no_more_results');
  });

  it('stops on repeated duplicate-only batches via empty-scroll limit', async () => {
    const dupBatch = makePosts(['dup1', 'dup2']);
    const loader = scriptedLoader([
      { type: 'posts', posts: dupBatch },
      { type: 'posts', posts: dupBatch },
      { type: 'posts', posts: dupBatch },
      { type: 'posts', posts: dupBatch },
    ]);

    const result = await runCollectionLoop({ ...baseInput, maxConsecutiveEmptyScrolls: 3 }, loader);

    expect(result.returnedCount).toBe(2);
    expect(result.stopReason).toBe('empty_scroll_limit');
  });

  it('stops at the scroll limit if target is never reached', async () => {
    let calls = 0;
    const loader: BatchLoader = {
      async loadNextBatch() {
        calls += 1;
        return { type: 'posts', posts: makePosts([`unique-${calls}`]) };
      },
    };

    const result = await runCollectionLoop({ ...baseInput, targetPosts: 1000, maxScrolls: 5 }, loader);

    expect(calls).toBe(5);
    expect(result.stopReason).toBe('scroll_limit');
  });

  it('stops immediately and reports blocked, never bypassing', async () => {
    const loader = scriptedLoader([{ type: 'blocked', reason: 'captcha' }]);

    const result = await runCollectionLoop(baseInput, loader);

    expect(result.stopReason).toBe('blocked');
    expect(result.posts).toHaveLength(0);
  });

  it('stops on timeout when the loader is slower than the configured budget', async () => {
    const loader: BatchLoader = {
      async loadNextBatch() {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return { type: 'posts', posts: makePosts(['p1']) };
      },
    };

    const result = await runCollectionLoop(
      { ...baseInput, targetPosts: 1000, maxScrolls: 1000, maxCollectionTimeSeconds: 0.02 },
      loader,
    );

    expect(result.stopReason).toBe('timeout');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/tiktok.collector.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/collectors/tiktok/tiktok.urls.ts`**

```ts
export function buildTikTokSearchUrl(query: string): string {
  return `https://www.tiktok.com/search?q=${encodeURIComponent(query)}`;
}
```

- [ ] **Step 4: Write `src/collectors/tiktok/tiktok.collector.ts`**

```ts
import { PlaywrightCrawler } from 'crawlee';
import type { SocialCollector } from '../collector.interface.js';
import type { CollectorInput, CollectorResult, StopReason } from '../collector.types.js';
import type { CollectedPost } from '../../types/social.types.js';
import { InCollectionDeduper } from '../../services/dedup.service.js';
import { CollectorBlockedError } from '../../utils/errors.js';
import { nowIso } from '../../utils/date.js';
import { logger } from '../../utils/logger.js';
import { TIKTOK_SELECTORS, TIKTOK_BLOCK_INDICATORS } from './tiktok.selectors.js';
import { parseSearchResultsHtml } from './tiktok.parser.js';
import { normalizeTikTokPost } from './tiktok.normalizer.js';
import { buildTikTokSearchUrl } from './tiktok.urls.js';

export type BatchResult =
  | { type: 'posts'; posts: CollectedPost[] }
  | { type: 'empty' }
  | { type: 'blocked'; reason: string }
  | { type: 'error'; message: string };

export interface BatchLoader {
  loadNextBatch(): Promise<BatchResult>;
}

export async function runCollectionLoop(input: CollectorInput, loader: BatchLoader): Promise<CollectorResult> {
  const deduper = new InCollectionDeduper();
  const collected: CollectedPost[] = [];
  let scannedCount = 0;
  let consecutiveEmptyScrolls = 0;
  let scrollCount = 0;
  const deadline = Date.now() + input.maxCollectionTimeSeconds * 1000;

  let stopReason: StopReason = 'no_more_results';

  while (true) {
    if (collected.length >= input.targetPosts) {
      stopReason = 'target_reached';
      break;
    }
    if (scrollCount >= input.maxScrolls) {
      stopReason = 'scroll_limit';
      break;
    }
    if (Date.now() >= deadline) {
      stopReason = 'timeout';
      break;
    }

    const batch = await loader.loadNextBatch();
    scrollCount += 1;

    if (batch.type === 'blocked') {
      stopReason = 'blocked';
      break;
    }
    if (batch.type === 'error') {
      logger.warn({ message: batch.message }, 'tiktok collector batch error');
      stopReason = 'error';
      break;
    }
    if (batch.type === 'empty') {
      stopReason = 'no_more_results';
      break;
    }

    scannedCount += batch.posts.length;
    const uniquePosts = batch.posts.filter((post) => !deduper.isDuplicate(post));

    if (uniquePosts.length === 0) {
      consecutiveEmptyScrolls += 1;
      if (consecutiveEmptyScrolls >= input.maxConsecutiveEmptyScrolls) {
        stopReason = 'empty_scroll_limit';
        break;
      }
      continue;
    }

    consecutiveEmptyScrolls = 0;
    collected.push(...uniquePosts);
  }

  return {
    posts: collected,
    scannedCount,
    returnedCount: collected.length,
    targetPosts: input.targetPosts,
    targetReached: collected.length >= input.targetPosts,
    stopReason,
  };
}

function detectBlock(html: string): string | null {
  const lower = html.toLowerCase();
  for (const selector of TIKTOK_BLOCK_INDICATORS.captchaSelectors) {
    if (html.includes(selector.replace(/^[.#]/, ''))) return 'captcha';
  }
  for (const indicator of TIKTOK_BLOCK_INDICATORS.textIndicators) {
    if (lower.includes(indicator)) return indicator;
  }
  return null;
}

export class TikTokCollector implements SocialCollector {
  async collect(input: CollectorInput): Promise<CollectorResult> {
    const pendingBatches: BatchResult[] = [];
    let finished = false;

    const crawler = new PlaywrightCrawler({
      headless: true,
      maxConcurrency: 1,
      maxRequestRetries: 2,
      navigationTimeoutSecs: 30,
      requestHandlerTimeoutSecs: 150,
      maxRequestsPerMinute: 10,
      requestHandler: async ({ page }) => {
        const html = await page.content();
        const blockReason = detectBlock(html);
        if (blockReason) {
          pendingBatches.push({ type: 'blocked', reason: blockReason });
          finished = true;
          return;
        }

        const raw = parseSearchResultsHtml(html);
        if (raw.length === 0) {
          pendingBatches.push({ type: 'empty' });
          finished = true;
          return;
        }

        const posts = raw
          .map((r) => normalizeTikTokPost(r, nowIso()))
          .filter((p): p is CollectedPost => p !== null);
        pendingBatches.push({ type: 'posts', posts });

        await page.mouse.wheel(0, 2000);
        await page.waitForTimeout(1000);
      },
      failedRequestHandler: async ({ request, error }) => {
        pendingBatches.push({ type: 'error', message: `${request.url}: ${String(error)}` });
        finished = true;
      },
    });

    const loader: BatchLoader = {
      async loadNextBatch() {
        if (pendingBatches.length === 0 && !finished) {
          await crawler.run([buildTikTokSearchUrl(input.query)]);
        }
        return pendingBatches.shift() ?? { type: 'empty' };
      },
    };

    try {
      const result = await runCollectionLoop(input, loader);
      if (result.stopReason === 'blocked') {
        throw new CollectorBlockedError(input.query);
      }
      return result;
    } finally {
      await crawler.teardown().catch(() => undefined);
    }
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/tiktok.collector.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 6: Verify full project still compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/collectors/tiktok/tiktok.collector.ts src/collectors/tiktok/tiktok.urls.ts tests/tiktok.collector.test.ts
git commit -m "feat: add pure target/overshoot collection loop and TikTokCollector (Crawlee/Playwright)"
```

---

### Task 13: Repository Layer (Prisma)

**Files:**
- Create: `src/repositories/author.repository.ts`, `src/repositories/post.repository.ts`, `src/repositories/metrics.repository.ts`, `src/repositories/collection-run.repository.ts`
- Test: `tests/metrics-repository.test.ts`, `tests/collection-run-repository.test.ts`

**Interfaces:**
- Consumes: `PrismaClient` (generated, Task 2), `CollectedPost`/`CollectedAuthor`/`CollectedMetrics` (Task 7), `StopReason` (Task 7).
- Produces: `upsertAuthor(prisma, platform, author): Promise<SocialAuthor | null>`, `upsertPost(prisma, platform, authorRecordId, post): Promise<{ post: SocialPost; created: boolean }>`, `hasMetricsChanged(latest: MetricSnapshot | null, next: CollectedMetrics): boolean` (pure, tested without a DB) + `appendMetricSnapshotIfChanged(prisma, postId, metrics): Promise<boolean>`, `deriveRunStatus(stopReason: StopReason, errorCode: string | null): 'completed'|'partial'|'failed'` (pure, tested without a DB) + `createCollectionRun(prisma, data)` / `finishCollectionRun(prisma, id, data)` — all consumed by `post.service.ts` (Task 14) and `collection.service.ts` (Task 15).

- [ ] **Step 1: Write the failing tests for the pure comparators**

```ts
// tests/metrics-repository.test.ts
import { describe, expect, it } from 'vitest';
import { hasMetricsChanged } from '../src/repositories/metrics.repository.js';

describe('hasMetricsChanged', () => {
  it('returns true when there is no prior snapshot', () => {
    expect(hasMetricsChanged(null, { views: 10, likes: 1, comments: 0, shares: 0, saves: null })).toBe(true);
  });

  it('returns false when every field matches the latest snapshot', () => {
    const latest = { views: 10000, likes: 500, comments: 20, shares: 5, saves: null };
    expect(hasMetricsChanged(latest, { views: 10000, likes: 500, comments: 20, shares: 5, saves: null })).toBe(
      false,
    );
  });

  it('returns true when any single field differs (e.g. views grew)', () => {
    const latest = { views: 10000, likes: 500, comments: 20, shares: 5, saves: null };
    expect(hasMetricsChanged(latest, { views: 40000, likes: 500, comments: 20, shares: 5, saves: null })).toBe(
      true,
    );
  });

  it('distinguishes null (unknown) from 0 (observed zero)', () => {
    const latest = { views: 0, likes: null, comments: 0, shares: 0, saves: null };
    expect(hasMetricsChanged(latest, { views: 0, likes: 0, comments: 0, shares: 0, saves: null })).toBe(true);
  });
});
```

```ts
// tests/collection-run-repository.test.ts
import { describe, expect, it } from 'vitest';
import { deriveRunStatus } from '../src/repositories/collection-run.repository.js';

describe('deriveRunStatus', () => {
  it('maps target_reached/no_more_results/scroll/empty-scroll limits to completed', () => {
    for (const reason of ['target_reached', 'no_more_results', 'scroll_limit', 'empty_scroll_limit', 'timeout'] as const) {
      expect(deriveRunStatus(reason, null)).toBe('completed');
    }
  });

  it('maps blocked or error stop reasons to failed', () => {
    expect(deriveRunStatus('blocked', 'COLLECTOR_BLOCKED')).toBe('failed');
    expect(deriveRunStatus('error', 'UNKNOWN_ERROR')).toBe('failed');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/metrics-repository.test.ts tests/collection-run-repository.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write `src/repositories/author.repository.ts`**

```ts
import type { PrismaClient, SocialAuthor } from '@prisma/client';
import type { CollectedAuthor, Platform } from '../types/social.types.js';

export async function upsertAuthor(
  prisma: PrismaClient,
  platform: Platform,
  author: CollectedAuthor,
): Promise<SocialAuthor> {
  const now = new Date();

  if (author.platformAuthorId) {
    return prisma.socialAuthor.upsert({
      where: { platform_platformAuthorId: { platform, platformAuthorId: author.platformAuthorId } },
      create: {
        platform,
        platformAuthorId: author.platformAuthorId,
        username: author.username,
        displayName: author.displayName,
        profileUrl: author.profileUrl,
        verified: author.verified,
        firstSeenAt: now,
        lastSeenAt: now,
      },
      update: {
        username: author.username,
        displayName: author.displayName,
        profileUrl: author.profileUrl,
        verified: author.verified,
        lastSeenAt: now,
      },
    });
  }

  const existing = await prisma.socialAuthor.findFirst({
    where: { platform, platformAuthorId: null, username: author.username },
  });

  if (existing) {
    return prisma.socialAuthor.update({
      where: { id: existing.id },
      data: {
        displayName: author.displayName,
        profileUrl: author.profileUrl,
        verified: author.verified,
        lastSeenAt: now,
      },
    });
  }

  return prisma.socialAuthor.create({
    data: {
      platform,
      platformAuthorId: null,
      username: author.username,
      displayName: author.displayName,
      profileUrl: author.profileUrl,
      verified: author.verified,
      firstSeenAt: now,
      lastSeenAt: now,
    },
  });
}
```

- [ ] **Step 4: Write `src/repositories/post.repository.ts`**

```ts
import type { PrismaClient, SocialPost } from '@prisma/client';
import type { CollectedPost, Platform } from '../types/social.types.js';

export interface UpsertPostResult {
  post: SocialPost;
  created: boolean;
}

export async function upsertPost(
  prisma: PrismaClient,
  platform: Platform,
  authorRecordId: string | null,
  post: CollectedPost,
): Promise<UpsertPostResult> {
  const now = new Date();
  const where = { platform_platformPostId: { platform, platformPostId: post.platformPostId } };

  const existing = await prisma.socialPost.findUnique({ where });

  const record = await prisma.socialPost.upsert({
    where,
    create: {
      platform,
      platformPostId: post.platformPostId,
      url: post.url,
      authorId: authorRecordId,
      text: post.text,
      hashtags: post.hashtags,
      publishedAt: post.publishedAt ? new Date(post.publishedAt) : null,
      firstSeenAt: now,
      lastSeenAt: now,
    },
    update: {
      url: post.url,
      authorId: authorRecordId,
      text: post.text,
      hashtags: post.hashtags,
      lastSeenAt: now,
    },
  });

  return { post: record, created: existing === null };
}
```

- [ ] **Step 5: Write `src/repositories/metrics.repository.ts`**

```ts
import type { PrismaClient } from '@prisma/client';
import type { CollectedMetrics } from '../types/social.types.js';

export interface MetricSnapshot {
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
}

export function hasMetricsChanged(latest: MetricSnapshot | null, next: CollectedMetrics): boolean {
  if (latest === null) return true;
  return (
    latest.views !== next.views ||
    latest.likes !== next.likes ||
    latest.comments !== next.comments ||
    latest.shares !== next.shares ||
    latest.saves !== next.saves
  );
}

export async function appendMetricSnapshotIfChanged(
  prisma: PrismaClient,
  postId: string,
  metrics: CollectedMetrics,
): Promise<boolean> {
  const latest = await prisma.socialMetric.findFirst({
    where: { postId },
    orderBy: { capturedAt: 'desc' },
  });

  if (!hasMetricsChanged(latest, metrics)) return false;

  await prisma.socialMetric.create({
    data: {
      postId,
      views: metrics.views,
      likes: metrics.likes,
      comments: metrics.comments,
      shares: metrics.shares,
      saves: metrics.saves,
    },
  });
  return true;
}
```

- [ ] **Step 6: Write `src/repositories/collection-run.repository.ts`**

```ts
import type { PrismaClient } from '@prisma/client';
import type { StopReason } from '../collectors/collector.types.js';

export type RunStatus = 'running' | 'completed' | 'partial' | 'failed';

export function deriveRunStatus(stopReason: StopReason, errorCode: string | null): RunStatus {
  if (stopReason === 'blocked' || stopReason === 'error' || errorCode) return 'failed';
  return 'completed';
}

export interface CreateRunInput {
  platform: string;
  queryType: string;
  queryValue: string;
  targetPosts: number;
}

export async function createCollectionRun(prisma: PrismaClient, data: CreateRunInput) {
  return prisma.collectionRun.create({
    data: { ...data, status: 'running' as RunStatus },
  });
}

export interface FinishRunInput {
  scannedCount: number;
  foundCount: number;
  newCount: number;
  updatedCount: number;
  failedCount: number;
  stopReason: StopReason;
  status: RunStatus;
  errorCode?: string | null;
  errorMessage?: string | null;
}

export async function finishCollectionRun(prisma: PrismaClient, id: string, data: FinishRunInput) {
  return prisma.collectionRun.update({
    where: { id },
    data: { ...data, finishedAt: new Date() },
  });
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run tests/metrics-repository.test.ts tests/collection-run-repository.test.ts`
Expected: PASS (6 tests)

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/repositories tests/metrics-repository.test.ts tests/collection-run-repository.test.ts
git commit -m "feat: add Prisma repositories for authors, posts, metric snapshots, collection runs"
```

---

### Task 14: Post Service

**Files:**
- Create: `src/services/post.service.ts`
- Test: `tests/post.service.test.ts`

**Interfaces:**
- Consumes: `upsertAuthor`, `upsertPost`, `appendMetricSnapshotIfChanged` (Task 13), `CollectedPost` (Task 7).
- Produces: `interface PersistPostResult { created: boolean; metricsChanged: boolean; postRecordId: string }`, `persistCollectedPost(prisma, post: CollectedPost): Promise<PersistPostResult>`, `listPosts(prisma, filters): Promise<...>`, `getPostById(prisma, id): Promise<{ post; author; latestMetrics; metricsHistory } | null>` — consumed by `collection.service.ts` (Task 15) and `posts.route.ts` (Task 18).

- [ ] **Step 1: Write the failing test**

```ts
// tests/post.service.test.ts
import { describe, expect, it, vi } from 'vitest';
import { persistCollectedPost } from '../src/services/post.service.js';
import type { CollectedPost } from '../src/types/social.types.js';

vi.mock('../src/repositories/author.repository.js', () => ({
  upsertAuthor: vi.fn(async () => ({ id: 'author-1' })),
}));
vi.mock('../src/repositories/post.repository.js', () => ({
  upsertPost: vi.fn(async () => ({ post: { id: 'post-1' }, created: true })),
}));
vi.mock('../src/repositories/metrics.repository.js', () => ({
  appendMetricSnapshotIfChanged: vi.fn(async () => true),
}));

const post: CollectedPost = {
  platform: 'tiktok',
  platformPostId: '1',
  url: 'https://www.tiktok.com/@u/video/1',
  text: null,
  hashtags: [],
  publishedAt: null,
  author: { platformAuthorId: null, username: 'u', displayName: null, profileUrl: null, verified: null },
  metrics: { views: 10, likes: 1, comments: 0, shares: 0, saves: null },
  collectedAt: '2026-09-21T00:00:00.000Z',
};

describe('persistCollectedPost', () => {
  it('upserts author, upserts post, and records a metric snapshot', async () => {
    const result = await persistCollectedPost({} as never, post);
    expect(result).toEqual({ created: true, metricsChanged: true, postRecordId: 'post-1' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/post.service.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/services/post.service.ts`**

```ts
import type { PrismaClient } from '@prisma/client';
import { upsertAuthor } from '../repositories/author.repository.js';
import { upsertPost } from '../repositories/post.repository.js';
import { appendMetricSnapshotIfChanged } from '../repositories/metrics.repository.js';
import type { CollectedPost } from '../types/social.types.js';

export interface PersistPostResult {
  created: boolean;
  metricsChanged: boolean;
  postRecordId: string;
}

export async function persistCollectedPost(prisma: PrismaClient, post: CollectedPost): Promise<PersistPostResult> {
  const author = await upsertAuthor(prisma, post.platform, post.author);
  const { post: postRecord, created } = await upsertPost(prisma, post.platform, author.id, post);
  const metricsChanged = await appendMetricSnapshotIfChanged(prisma, postRecord.id, post.metrics);

  return { created, metricsChanged, postRecordId: postRecord.id };
}

export interface ListPostsFilters {
  platform?: string;
  keyword?: string;
  from?: Date;
  to?: Date;
  limit: number;
  offset: number;
  sort: 'publishedAt_desc' | 'publishedAt_asc' | 'firstSeenAt_desc';
}

const SORT_MAP = {
  publishedAt_desc: { publishedAt: 'desc' as const },
  publishedAt_asc: { publishedAt: 'asc' as const },
  firstSeenAt_desc: { firstSeenAt: 'desc' as const },
};

export async function listPosts(prisma: PrismaClient, filters: ListPostsFilters) {
  return prisma.socialPost.findMany({
    where: {
      platform: filters.platform,
      text: filters.keyword ? { contains: filters.keyword, mode: 'insensitive' } : undefined,
      publishedAt:
        filters.from || filters.to
          ? { gte: filters.from, lte: filters.to }
          : undefined,
    },
    orderBy: SORT_MAP[filters.sort],
    take: filters.limit,
    skip: filters.offset,
    include: { author: true },
  });
}

export async function getPostById(prisma: PrismaClient, id: string) {
  const post = await prisma.socialPost.findUnique({
    where: { id },
    include: {
      author: true,
      metrics: { orderBy: { capturedAt: 'desc' } },
    },
  });
  if (!post) return null;

  const [latestMetrics, ...metricsHistory] = post.metrics;
  return { post, author: post.author, latestMetrics: latestMetrics ?? null, metricsHistory };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/post.service.test.ts`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add src/services/post.service.ts tests/post.service.test.ts
git commit -m "feat: add post service (persist collected posts, list/get with metrics history)"
```

---

### Task 15: Collection Service

**Files:**
- Create: `src/services/collection.service.ts`
- Test: `tests/collection.service.test.ts`

**Interfaces:**
- Consumes: `SocialCollector`, `CollectorInput` (Task 7), `persistCollectedPost` (Task 14), `createCollectionRun`, `finishCollectionRun`, `deriveRunStatus` (Task 13), `CollectorBlockedError` (Task 6).
- Produces: `interface RunCollectionInput { platform: 'tiktok'; keywords: string[]; targetPostsPerQuery: number; targetTotalPosts?: number; maxScrollsPerQuery: number; maxCollectionTimePerQuerySeconds: number; maxConsecutiveEmptyScrolls: number }`, `interface RunCollectionSummary { status: 'completed'|'partial'|'failed'; summary: { target: number; found: number; new: number; updated: number; failed: number }; runs: Array<{ runId: string; keyword: string; targetPosts: number; returnedPosts: number; targetReached: boolean; stopReason: string }> }`, `runCollection(prisma, collector: SocialCollector, input: RunCollectionInput): Promise<RunCollectionSummary>` — consumed by `collect.route.ts` (Task 18).

- [ ] **Step 1: Write the failing test**

```ts
// tests/collection.service.test.ts
import { describe, expect, it, vi } from 'vitest';
import { runCollection } from '../src/services/collection.service.js';
import type { SocialCollector } from '../src/collectors/collector.interface.js';
import type { CollectedPost } from '../src/types/social.types.js';

vi.mock('../src/services/post.service.js', () => ({
  persistCollectedPost: vi.fn(async () => ({ created: true, metricsChanged: true, postRecordId: 'p' })),
}));
vi.mock('../src/repositories/collection-run.repository.js', () => ({
  createCollectionRun: vi.fn(async () => ({ id: 'run-1' })),
  finishCollectionRun: vi.fn(async () => ({})),
  deriveRunStatus: (stopReason: string) => (stopReason === 'blocked' ? 'failed' : 'completed'),
}));

function fakePost(id: string): CollectedPost {
  return {
    platform: 'tiktok',
    platformPostId: id,
    url: `https://www.tiktok.com/@u/video/${id}`,
    text: null,
    hashtags: [],
    publishedAt: null,
    author: { platformAuthorId: null, username: 'u', displayName: null, profileUrl: null, verified: null },
    metrics: { views: null, likes: null, comments: null, shares: null, saves: null },
    collectedAt: '2026-09-21T00:00:00.000Z',
  };
}

describe('runCollection', () => {
  it('sums per-keyword results into the response summary, found can exceed target', async () => {
    const collector: SocialCollector = {
      collect: vi
        .fn()
        .mockResolvedValueOnce({
          posts: Array.from({ length: 34 }, (_, i) => fakePost(`a${i}`)),
          scannedCount: 34,
          returnedCount: 34,
          targetPosts: 30,
          targetReached: true,
          stopReason: 'target_reached',
        })
        .mockResolvedValueOnce({
          posts: Array.from({ length: 33 }, (_, i) => fakePost(`b${i}`)),
          scannedCount: 33,
          returnedCount: 33,
          targetPosts: 30,
          targetReached: true,
          stopReason: 'target_reached',
        }),
    };

    const result = await runCollection({} as never, collector, {
      platform: 'tiktok',
      keywords: ['UTCC', 'มหาวิทยาลัยหอการค้าไทย'],
      targetPostsPerQuery: 30,
      targetTotalPosts: 60,
      maxScrollsPerQuery: 30,
      maxCollectionTimePerQuerySeconds: 120,
      maxConsecutiveEmptyScrolls: 3,
    });

    expect(result.summary.target).toBe(60);
    expect(result.summary.found).toBe(67);
    expect(result.summary.new).toBe(67);
    expect(result.runs).toHaveLength(2);
    expect(result.runs[0]).toMatchObject({ keyword: 'UTCC', returnedPosts: 34, targetReached: true, stopReason: 'target_reached' });
    expect(result.status).toBe('completed');
  });

  it('stops starting new keyword queries once targetTotalPosts is met', async () => {
    const collect = vi
      .fn()
      .mockResolvedValueOnce({
        posts: Array.from({ length: 80 }, (_, i) => fakePost(`a${i}`)),
        scannedCount: 80,
        returnedCount: 80,
        targetPosts: 30,
        targetReached: true,
        stopReason: 'target_reached',
      })
      .mockResolvedValueOnce({
        posts: [],
        scannedCount: 0,
        returnedCount: 0,
        targetPosts: 30,
        targetReached: false,
        stopReason: 'no_more_results',
      });
    const collector: SocialCollector = { collect };

    await runCollection({} as never, collector, {
      platform: 'tiktok',
      keywords: ['a', 'b', 'c'],
      targetPostsPerQuery: 30,
      targetTotalPosts: 60,
      maxScrollsPerQuery: 30,
      maxCollectionTimePerQuerySeconds: 120,
      maxConsecutiveEmptyScrolls: 3,
    });

    expect(collect).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/collection.service.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/services/collection.service.ts`**

```ts
import type { PrismaClient } from '@prisma/client';
import type { SocialCollector } from '../collectors/collector.interface.js';
import { persistCollectedPost } from './post.service.js';
import { createCollectionRun, finishCollectionRun, deriveRunStatus } from '../repositories/collection-run.repository.js';
import { CollectorBlockedError } from '../utils/errors.js';

export interface RunCollectionInput {
  platform: 'tiktok';
  keywords: string[];
  targetPostsPerQuery: number;
  targetTotalPosts?: number;
  maxScrollsPerQuery: number;
  maxCollectionTimePerQuerySeconds: number;
  maxConsecutiveEmptyScrolls: number;
}

export interface RunSummaryEntry {
  runId: string;
  keyword: string;
  targetPosts: number;
  returnedPosts: number;
  targetReached: boolean;
  stopReason: string;
}

export interface RunCollectionSummary {
  status: 'completed' | 'partial' | 'failed';
  summary: { target: number; found: number; new: number; updated: number; failed: number };
  runs: RunSummaryEntry[];
}

export async function runCollection(
  prisma: PrismaClient,
  collector: SocialCollector,
  input: RunCollectionInput,
): Promise<RunCollectionSummary> {
  const runs: RunSummaryEntry[] = [];
  let found = 0;
  let newCount = 0;
  let updated = 0;
  let failed = 0;
  let anyFailed = false;

  for (const keyword of input.keywords) {
    if (input.targetTotalPosts !== undefined && found >= input.targetTotalPosts) {
      break;
    }

    const runRecord = await createCollectionRun(prisma, {
      platform: input.platform,
      queryType: 'keyword',
      queryValue: keyword,
      targetPosts: input.targetPostsPerQuery,
    });

    try {
      const result = await collector.collect({
        query: keyword,
        targetPosts: input.targetPostsPerQuery,
        maxScrolls: input.maxScrollsPerQuery,
        maxCollectionTimeSeconds: input.maxCollectionTimePerQuerySeconds,
        maxConsecutiveEmptyScrolls: input.maxConsecutiveEmptyScrolls,
      });

      let runNew = 0;
      let runUpdated = 0;
      let runFailed = 0;
      for (const post of result.posts) {
        try {
          const persisted = await persistCollectedPost(prisma, post);
          if (persisted.created) runNew += 1;
          else runUpdated += 1;
        } catch {
          runFailed += 1;
        }
      }

      const status = deriveRunStatus(result.stopReason, null);
      await finishCollectionRun(prisma, runRecord.id, {
        scannedCount: result.scannedCount,
        foundCount: result.returnedCount,
        newCount: runNew,
        updatedCount: runUpdated,
        failedCount: runFailed,
        stopReason: result.stopReason,
        status,
      });

      found += result.returnedCount;
      newCount += runNew;
      updated += runUpdated;
      failed += runFailed;

      runs.push({
        runId: runRecord.id,
        keyword,
        targetPosts: input.targetPostsPerQuery,
        returnedPosts: result.returnedCount,
        targetReached: result.targetReached,
        stopReason: result.stopReason,
      });
    } catch (error) {
      anyFailed = true;
      const blocked = error instanceof CollectorBlockedError;
      await finishCollectionRun(prisma, runRecord.id, {
        scannedCount: 0,
        foundCount: 0,
        newCount: 0,
        updatedCount: 0,
        failedCount: 0,
        stopReason: blocked ? 'blocked' : 'error',
        status: 'failed',
        errorCode: blocked ? 'COLLECTOR_BLOCKED' : 'COLLECTOR_ERROR',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      runs.push({
        runId: runRecord.id,
        keyword,
        targetPosts: input.targetPostsPerQuery,
        returnedPosts: 0,
        targetReached: false,
        stopReason: blocked ? 'blocked' : 'error',
      });
    }
  }

  return {
    status: anyFailed ? (found > 0 ? 'partial' : 'failed') : 'completed',
    summary: {
      target: input.targetTotalPosts ?? input.targetPostsPerQuery * input.keywords.length,
      found,
      new: newCount,
      updated,
      failed,
    },
    runs,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/collection.service.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/services/collection.service.ts tests/collection.service.test.ts
git commit -m "feat: add collection service orchestrating per-keyword runs into a summary response"
```

---

### Task 16: Analytics Service

**Files:**
- Create: `src/services/analytics.service.ts`
- Test: `tests/analytics.test.ts`

**Interfaces:**
- Produces: `interface AnalyticsRow { postId: string; text: string|null; hashtags: string[]; publishedAt: Date|null; views: number|null; likes: number|null; comments: number|null; shares: number|null; saves: number|null; url: string }`, `interface AnalyticsSummary { period: { from: string; to: string }; posts: { total: number; new: number }; engagement: { views: number; likes: number; comments: number; shares: number; saves: number }; topHashtags: Array<{ tag: string; count: number }>; topPosts: Array<{ postId: string; url: string; views: number }>; dailyMentions: Array<{ date: string; count: number }> }`, `computeAnalyticsSummary(rows: AnalyticsRow[], newCount: number, from: Date, to: Date): AnalyticsSummary` (pure), `fetchAnalyticsRows(prisma, platform?: string, from?: Date, to?: Date): Promise<AnalyticsRow[]>` — consumed by `analytics.route.ts` (Task 18).

- [ ] **Step 1: Write the failing test**

```ts
// tests/analytics.test.ts
import { describe, expect, it } from 'vitest';
import { computeAnalyticsSummary, type AnalyticsRow } from '../src/services/analytics.service.js';

function row(overrides: Partial<AnalyticsRow>): AnalyticsRow {
  return {
    postId: 'p1',
    text: null,
    hashtags: [],
    publishedAt: new Date('2026-09-20T00:00:00.000Z'),
    views: null,
    likes: null,
    comments: null,
    shares: null,
    saves: null,
    url: 'https://www.tiktok.com/@u/video/1',
    ...overrides,
  };
}

describe('computeAnalyticsSummary', () => {
  it('sums engagement treating null as 0 without hiding missing data from totals', () => {
    const rows = [
      row({ postId: 'p1', views: 100, likes: 10, hashtags: ['UTCC'] }),
      row({ postId: 'p2', views: null, likes: 5, hashtags: ['UTCC', 'หอการค้า'] }),
    ];
    const summary = computeAnalyticsSummary(rows, 2, new Date('2026-09-14'), new Date('2026-09-21'));

    expect(summary.posts.total).toBe(2);
    expect(summary.posts.new).toBe(2);
    expect(summary.engagement.views).toBe(100);
    expect(summary.engagement.likes).toBe(15);
  });

  it('ranks top hashtags by frequency', () => {
    const rows = [
      row({ postId: 'p1', hashtags: ['UTCC'] }),
      row({ postId: 'p2', hashtags: ['UTCC', 'หอการค้า'] }),
      row({ postId: 'p3', hashtags: ['หอการค้า'] }),
    ];
    const summary = computeAnalyticsSummary(rows, 3, new Date('2026-09-14'), new Date('2026-09-21'));

    expect(summary.topHashtags[0]).toEqual({ tag: 'UTCC', count: 2 });
    expect(summary.topHashtags[1]).toEqual({ tag: 'หอการค้า', count: 2 });
  });

  it('ranks top posts by views descending, nulls last', () => {
    const rows = [
      row({ postId: 'p1', views: 100 }),
      row({ postId: 'p2', views: 500 }),
      row({ postId: 'p3', views: null }),
    ];
    const summary = computeAnalyticsSummary(rows, 3, new Date('2026-09-14'), new Date('2026-09-21'));

    expect(summary.topPosts.map((p) => p.postId)).toEqual(['p2', 'p1', 'p3']);
  });

  it('groups daily mentions by publishedAt date (UTC)', () => {
    const rows = [
      row({ postId: 'p1', publishedAt: new Date('2026-09-20T01:00:00.000Z') }),
      row({ postId: 'p2', publishedAt: new Date('2026-09-20T22:00:00.000Z') }),
      row({ postId: 'p3', publishedAt: new Date('2026-09-19T10:00:00.000Z') }),
    ];
    const summary = computeAnalyticsSummary(rows, 3, new Date('2026-09-14'), new Date('2026-09-21'));

    expect(summary.dailyMentions).toContainEqual({ date: '2026-09-20', count: 2 });
    expect(summary.dailyMentions).toContainEqual({ date: '2026-09-19', count: 1 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/analytics.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/services/analytics.service.ts`**

```ts
import type { PrismaClient } from '@prisma/client';

export interface AnalyticsRow {
  postId: string;
  text: string | null;
  hashtags: string[];
  publishedAt: Date | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  url: string;
}

export interface AnalyticsSummary {
  period: { from: string; to: string };
  posts: { total: number; new: number };
  engagement: { views: number; likes: number; comments: number; shares: number; saves: number };
  topHashtags: Array<{ tag: string; count: number }>;
  topPosts: Array<{ postId: string; url: string; views: number }>;
  dailyMentions: Array<{ date: string; count: number }>;
}

function sum(rows: AnalyticsRow[], key: keyof Pick<AnalyticsRow, 'views' | 'likes' | 'comments' | 'shares' | 'saves'>) {
  return rows.reduce((total, row) => total + (row[key] ?? 0), 0);
}

export function computeAnalyticsSummary(
  rows: AnalyticsRow[],
  newCount: number,
  from: Date,
  to: Date,
): AnalyticsSummary {
  const hashtagCounts = new Map<string, number>();
  for (const row of rows) {
    for (const tag of row.hashtags) {
      hashtagCounts.set(tag, (hashtagCounts.get(tag) ?? 0) + 1);
    }
  }
  const topHashtags = [...hashtagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([tag, count]) => ({ tag, count }));

  const topPosts = [...rows]
    .sort((a, b) => (b.views ?? -1) - (a.views ?? -1))
    .slice(0, 10)
    .map((row) => ({ postId: row.postId, url: row.url, views: row.views ?? 0 }));

  const dailyCounts = new Map<string, number>();
  for (const row of rows) {
    if (!row.publishedAt) continue;
    const date = row.publishedAt.toISOString().slice(0, 10);
    dailyCounts.set(date, (dailyCounts.get(date) ?? 0) + 1);
  }
  const dailyMentions = [...dailyCounts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, count]) => ({ date, count }));

  return {
    period: { from: from.toISOString(), to: to.toISOString() },
    posts: { total: rows.length, new: newCount },
    engagement: {
      views: sum(rows, 'views'),
      likes: sum(rows, 'likes'),
      comments: sum(rows, 'comments'),
      shares: sum(rows, 'shares'),
      saves: sum(rows, 'saves'),
    },
    topHashtags,
    topPosts,
    dailyMentions,
  };
}

export async function fetchAnalyticsRows(
  prisma: PrismaClient,
  platform: string | undefined,
  from: Date,
  to: Date,
): Promise<AnalyticsRow[]> {
  const posts = await prisma.socialPost.findMany({
    where: {
      platform,
      firstSeenAt: { gte: from, lte: to },
    },
    include: { metrics: { orderBy: { capturedAt: 'desc' }, take: 1 } },
  });

  return posts.map((post) => {
    const latest = post.metrics[0];
    return {
      postId: post.id,
      text: post.text,
      hashtags: Array.isArray(post.hashtags) ? (post.hashtags as string[]) : [],
      publishedAt: post.publishedAt,
      views: latest?.views ?? null,
      likes: latest?.likes ?? null,
      comments: latest?.comments ?? null,
      shares: latest?.shares ?? null,
      saves: latest?.saves ?? null,
      url: post.url,
    };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/analytics.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/services/analytics.service.ts tests/analytics.test.ts
git commit -m "feat: add analytics service computing summaries in-process (no LLM math)"
```

---

### Task 17: Zod Request Schemas

**Files:**
- Create: `src/schemas/collection.schema.ts`, `src/schemas/post.schema.ts`, `src/schemas/analytics.schema.ts`
- Test: `tests/schemas.test.ts`

**Interfaces:**
- Produces: `collectionRequestSchema` (+ inferred `CollectionRequest` type), `listPostsQuerySchema`, `analyticsSummaryQuerySchema` — consumed by routes (Task 18).

- [ ] **Step 1: Write the failing test**

```ts
// tests/schemas.test.ts
import { describe, expect, it } from 'vitest';
import { collectionRequestSchema } from '../src/schemas/collection.schema.js';
import { listPostsQuerySchema } from '../src/schemas/post.schema.js';
import { analyticsSummaryQuerySchema } from '../src/schemas/analytics.schema.js';

describe('collectionRequestSchema', () => {
  it('trims, dedupes, and drops empty keywords; applies defaults', () => {
    const parsed = collectionRequestSchema.parse({
      platform: 'tiktok',
      keywords: [' UTCC ', 'UTCC', '', '  ', 'หอการค้า'],
    });
    expect(parsed.keywords).toEqual(['UTCC', 'หอการค้า']);
    expect(parsed.targetPostsPerQuery).toBe(30);
    expect(parsed.maxScrollsPerQuery).toBe(30);
    expect(parsed.maxCollectionTimePerQuerySeconds).toBe(120);
  });

  it('rejects more than 20 keywords', () => {
    const keywords = Array.from({ length: 21 }, (_, i) => `kw${i}`);
    expect(() => collectionRequestSchema.parse({ platform: 'tiktok', keywords })).toThrow();
  });

  it('rejects zero keywords after cleanup', () => {
    expect(() => collectionRequestSchema.parse({ platform: 'tiktok', keywords: ['', '  '] })).toThrow();
  });

  it('rejects targetPostsPerQuery outside 1..1000', () => {
    expect(() =>
      collectionRequestSchema.parse({ platform: 'tiktok', keywords: ['a'], targetPostsPerQuery: 1001 }),
    ).toThrow();
  });
});

describe('listPostsQuerySchema', () => {
  it('applies sane defaults for limit/offset/sort', () => {
    const parsed = listPostsQuerySchema.parse({});
    expect(parsed.limit).toBe(20);
    expect(parsed.offset).toBe(0);
    expect(parsed.sort).toBe('publishedAt_desc');
  });
});

describe('analyticsSummaryQuerySchema', () => {
  it('defaults to a 7 day period when from/to are omitted', () => {
    const parsed = analyticsSummaryQuerySchema.parse({});
    expect(parsed.from).toBeUndefined();
    expect(parsed.to).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/schemas.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write `src/schemas/collection.schema.ts`**

```ts
import { z } from 'zod';

export const collectionRequestSchema = z
  .object({
    platform: z.literal('tiktok'),
    keywords: z
      .array(z.string())
      .min(1)
      .max(20)
      .transform((values) => {
        const cleaned = values.map((v) => v.trim()).filter((v) => v.length > 0);
        return [...new Set(cleaned)];
      })
      .refine((values) => values.length >= 1, 'At least one non-empty keyword is required'),
    targetPostsPerQuery: z.coerce.number().int().min(1).max(1000).default(30),
    targetTotalPosts: z.coerce.number().int().min(1).optional(),
    maxScrollsPerQuery: z.coerce.number().int().min(1).max(200).default(30),
    maxCollectionTimePerQuerySeconds: z.coerce.number().int().min(10).max(600).default(120),
    maxConsecutiveEmptyScrolls: z.coerce.number().int().min(1).max(20).default(3),
  })
  .strict();

export type CollectionRequest = z.infer<typeof collectionRequestSchema>;
```

- [ ] **Step 4: Write `src/schemas/post.schema.ts`**

```ts
import { z } from 'zod';

export const listPostsQuerySchema = z.object({
  platform: z.string().optional(),
  keyword: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  sort: z.enum(['publishedAt_desc', 'publishedAt_asc', 'firstSeenAt_desc']).default('publishedAt_desc'),
});

export type ListPostsQuery = z.infer<typeof listPostsQuerySchema>;
```

- [ ] **Step 5: Write `src/schemas/analytics.schema.ts`**

```ts
import { z } from 'zod';

export const analyticsSummaryQuerySchema = z.object({
  platform: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export type AnalyticsSummaryQuery = z.infer<typeof analyticsSummaryQuerySchema>;
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run tests/schemas.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 7: Commit**

```bash
git add src/schemas tests/schemas.test.ts
git commit -m "feat: add zod request schemas for collect/posts/analytics endpoints"
```

---

### Task 18: Fastify App, Routes, Server

**Files:**
- Create: `src/app.ts`, `src/server.ts`, `src/routes/health.route.ts`, `src/routes/collect.route.ts`, `src/routes/posts.route.ts`, `src/routes/analytics.route.ts`, `src/routes/runs.route.ts`
- Test: `tests/routes.test.ts`

**Interfaces:**
- Consumes: `loadEnv` (Task 3), `collectionRequestSchema`, `listPostsQuerySchema`, `analyticsSummaryQuerySchema` (Task 17), `runCollection` (Task 15), `listPosts`, `getPostById` (Task 14), `computeAnalyticsSummary`, `fetchAnalyticsRows` (Task 16), `TikTokCollector` (Task 12), `AppError` (Task 6).
- Produces: `buildApp(deps: { prisma: PrismaClient; collector: SocialCollector }): FastifyInstance` — consumed by `src/server.ts` and by tests via `.inject()`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/routes.test.ts
import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';

function fakePrisma() {
  return {
    socialPost: { findMany: vi.fn(async () => []), findUnique: vi.fn(async () => null) },
    collectionRun: { findMany: vi.fn(async () => []), findUnique: vi.fn(async () => null) },
  } as never;
}

describe('routes', () => {
  it('GET /api/social/health returns ok', async () => {
    const app = buildApp({ prisma: fakePrisma(), collector: { collect: vi.fn() } });
    const response = await app.inject({ method: 'GET', url: '/api/social/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });

  it('POST /api/social/collect rejects invalid body with 400', async () => {
    const app = buildApp({ prisma: fakePrisma(), collector: { collect: vi.fn() } });
    const response = await app.inject({
      method: 'POST',
      url: '/api/social/collect',
      payload: { platform: 'tiktok', keywords: [] },
    });
    expect(response.statusCode).toBe(400);
  });

  it('GET /api/social/posts returns an empty list from an empty store', async () => {
    const app = buildApp({ prisma: fakePrisma(), collector: { collect: vi.fn() } });
    const response = await app.inject({ method: 'GET', url: '/api/social/posts' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([]);
  });

  it('GET /api/social/posts/:id returns 404 for a missing post', async () => {
    const app = buildApp({ prisma: fakePrisma(), collector: { collect: vi.fn() } });
    const response = await app.inject({ method: 'GET', url: '/api/social/posts/missing' });
    expect(response.statusCode).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/routes.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/routes/health.route.ts`**

```ts
import type { FastifyInstance } from 'fastify';

export async function healthRoute(app: FastifyInstance) {
  app.get('/api/social/health', async () => ({ status: 'ok' }));
}
```

- [ ] **Step 4: Write `src/routes/collect.route.ts`**

```ts
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { SocialCollector } from '../collectors/collector.interface.js';
import { collectionRequestSchema } from '../schemas/collection.schema.js';
import { runCollection } from '../services/collection.service.js';

export async function collectRoute(app: FastifyInstance, deps: { prisma: PrismaClient; collector: SocialCollector }) {
  app.post('/api/social/collect', async (request, reply) => {
    const parsed = collectionRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'INVALID_REQUEST', details: parsed.error.flatten() });
    }

    const result = await runCollection(deps.prisma, deps.collector, parsed.data);
    return reply.status(200).send(result);
  });
}
```

- [ ] **Step 5: Write `src/routes/posts.route.ts`**

```ts
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { listPostsQuerySchema } from '../schemas/post.schema.js';
import { listPosts, getPostById } from '../services/post.service.js';

export async function postsRoute(app: FastifyInstance, deps: { prisma: PrismaClient }) {
  app.get('/api/social/posts', async (request, reply) => {
    const parsed = listPostsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'INVALID_REQUEST', details: parsed.error.flatten() });
    }
    const posts = await listPosts(deps.prisma, parsed.data);
    return reply.status(200).send(posts);
  });

  app.get<{ Params: { id: string } }>('/api/social/posts/:id', async (request, reply) => {
    const result = await getPostById(deps.prisma, request.params.id);
    if (!result) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Post not found' });
    }
    return reply.status(200).send(result);
  });
}
```

- [ ] **Step 6: Write `src/routes/analytics.route.ts`**

```ts
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { analyticsSummaryQuerySchema } from '../schemas/analytics.schema.js';
import { computeAnalyticsSummary, fetchAnalyticsRows } from '../services/analytics.service.js';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export async function analyticsRoute(app: FastifyInstance, deps: { prisma: PrismaClient }) {
  app.get('/api/social/analytics/summary', async (request, reply) => {
    const parsed = analyticsSummaryQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'INVALID_REQUEST', details: parsed.error.flatten() });
    }

    const to = parsed.data.to ?? new Date();
    const from = parsed.data.from ?? new Date(to.getTime() - SEVEN_DAYS_MS);
    const rows = await fetchAnalyticsRows(deps.prisma, parsed.data.platform, from, to);
    const summary = computeAnalyticsSummary(rows, rows.length, from, to);
    return reply.status(200).send(summary);
  });
}
```

- [ ] **Step 7: Write `src/routes/runs.route.ts`**

```ts
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';

export async function runsRoute(app: FastifyInstance, deps: { prisma: PrismaClient }) {
  app.get('/api/social/runs', async (request, reply) => {
    const runs = await deps.prisma.collectionRun.findMany({ orderBy: { startedAt: 'desc' }, take: 50 });
    return reply.status(200).send(runs);
  });

  app.get<{ Params: { id: string } }>('/api/social/runs/:id', async (request, reply) => {
    const run = await deps.prisma.collectionRun.findUnique({ where: { id: request.params.id } });
    if (!run) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Run not found' });
    }
    return reply.status(200).send(run);
  });
}
```

- [ ] **Step 8: Write `src/app.ts`**

```ts
import Fastify, { type FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { SocialCollector } from './collectors/collector.interface.js';
import { healthRoute } from './routes/health.route.js';
import { collectRoute } from './routes/collect.route.js';
import { postsRoute } from './routes/posts.route.js';
import { analyticsRoute } from './routes/analytics.route.js';
import { runsRoute } from './routes/runs.route.js';

export interface AppDeps {
  prisma: PrismaClient;
  collector: SocialCollector;
}

export function buildApp(deps: AppDeps): FastifyInstance {
  const app = Fastify({ logger: false });

  app.register(healthRoute);
  app.register((instance) => collectRoute(instance, deps));
  app.register((instance) => postsRoute(instance, deps));
  app.register((instance) => analyticsRoute(instance, deps));
  app.register((instance) => runsRoute(instance, deps));

  return app;
}
```

- [ ] **Step 9: Write `src/server.ts`**

```ts
import { PrismaClient } from '@prisma/client';
import { buildApp } from './app.js';
import { loadEnv } from './config/env.js';
import { TikTokCollector } from './collectors/tiktok/tiktok.collector.js';
import { logger } from './utils/logger.js';

const config = loadEnv(process.env);
const prisma = new PrismaClient({ datasourceUrl: config.databaseUrl });
const collector = new TikTokCollector();

const app = buildApp({ prisma, collector });

app
  .listen({ port: config.port, host: '0.0.0.0' })
  .then(() => logger.info(`Server listening on port ${config.port}`))
  .catch((error) => {
    logger.error(error, 'Failed to start server');
    process.exit(1);
  });
```

- [ ] **Step 10: Run test to verify it passes**

Run: `npx vitest run tests/routes.test.ts`
Expected: PASS (4 tests)

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 11: Commit**

```bash
git add src/app.ts src/server.ts src/routes tests/routes.test.ts
git commit -m "feat: wire Fastify app, routes, and server entrypoint"
```

---

### Task 19: Manual Collector Test Script

**Files:**
- Create: `scripts/test-tiktok-collector.ts`

**Interfaces:**
- Consumes: `TikTokCollector` (Task 12), `loadEnv` (Task 3).
- Produces: a CLI script run via `npm run collector:test -- --keyword "UTCC" --target 30`, printing the manual-test output format from the spec (section 33). Not covered by automated tests — this is the one intentional live-TikTok entry point.

- [ ] **Step 1: Write `scripts/test-tiktok-collector.ts`**

```ts
import { TikTokCollector } from '../src/collectors/tiktok/tiktok.collector.js';
import { loadEnv } from '../src/config/env.js';

function parseArg(name: string, fallback: string): string {
  const flag = `--${name}`;
  const index = process.argv.indexOf(flag);
  return index !== -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

async function main() {
  const config = loadEnv(process.env);
  const keyword = parseArg('keyword', 'UTCC');
  const target = Number(parseArg('target', String(config.defaults.targetPostsPerQuery)));

  const collector = new TikTokCollector();
  const startedAt = Date.now();

  const result = await collector.collect({
    query: keyword,
    targetPosts: target,
    maxScrolls: config.defaults.maxScrollsPerQuery,
    maxCollectionTimeSeconds: config.collector.timeoutSeconds,
    maxConsecutiveEmptyScrolls: config.defaults.maxEmptyScrolls,
  });

  const durationSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);

  console.log(`Keyword: ${keyword}`);
  console.log(`Target posts: ${target}`);
  console.log(`Posts collected: ${result.returnedCount}`);
  console.log(`Target reached: ${result.targetReached ? 'yes' : 'no'}`);
  console.log(`Stop reason: ${result.stopReason}`);
  console.log(`Duration: ${durationSeconds}s`);
}

main().catch((error) => {
  console.error('Collector test failed:', error);
  process.exitCode = 1;
});
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add scripts/test-tiktok-collector.ts
git commit -m "feat: add manual live-TikTok collector test script (opt-in, not run by CI)"
```

---

### Task 20: README

**Files:**
- Create: `README.md`

**Interfaces:**
- Produces: setup, run, test, and constraint documentation for the project.

- [ ] **Step 1: Write `README.md`**

```markdown
# Social Listening Backend (V1 — TikTok)

Self-hosted backend that collects **public** TikTok data (no Apify, no paid
scraping API/proxy/SaaS, no TikTok Research API), normalizes and dedupes it,
and stores it as historical data in PostgreSQL for reuse by an external
Agentflow orchestrator (LLM analysis, Word report, dashboard).

## Requirements

- Node.js 24+
- Docker (for PostgreSQL 17)

## Setup

\`\`\`bash
npm install
npx playwright install chromium
cp .env.example .env
docker compose up -d postgres
npx prisma generate
npx prisma migrate dev --name init
npm run build
npm test
\`\`\`

## Running

\`\`\`bash
npm run dev      # ts-node/tsx dev server on $PORT (default 8000)
npm start        # run the built dist/server.js
\`\`\`

## Manual (live) TikTok collector test

Automated tests never hit live TikTok. To try the real collector:

\`\`\`bash
npm run collector:test -- --keyword "UTCC" --target 30
\`\`\`

## Collection target semantics

`targetPostsPerQuery` / `targetTotalPosts` are **desired minimums**, not hard
caps. The collector keeps loading batches until the target is met, then
returns the *entire* last batch — results can exceed the target slightly.
If TikTok has fewer posts than the target, the actual (smaller) count is
returned; nothing is fabricated. See
`docs/superpowers/specs/2026-09-21-social-listening-backend-v1-design.md`
for the full design.

## API

- `POST /api/social/collect`
- `GET /api/social/posts`, `GET /api/social/posts/:id`
- `GET /api/social/runs`, `GET /api/social/runs/:id`
- `GET /api/social/analytics/summary`

## Constraints

No Apify, no paid scraping API/proxy/SaaS, no TikTok Research API, no login/
CAPTCHA/access-control bypass, no fabricated data, PostgreSQL only (no
MySQL). TikTok DOM selectors live only in
`src/collectors/tiktok/tiktok.selectors.ts` and are marked
`TODO: VERIFY_WITH_LIVE_TIKTOK` until confirmed against a live page.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with setup, run, and constraint documentation"
```

---

### Task 21: Full Build & Validate Pass

**Files:** none created — verification only.

**Interfaces:** none.

- [ ] **Step 1: Full clean install and Playwright browser install**

Run: `npm install`
Run: `npx playwright install chromium`
Expected: both succeed.

- [ ] **Step 2: Prisma generate**

Run: `npx prisma generate`
Expected: succeeds.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: `dist/` populated, no TypeScript errors.

- [ ] **Step 4: Full test suite**

Run: `npm test`
Expected: all test files pass, including the target/overshoot assertions in `tests/tiktok.collector.test.ts` (`returnedCount === 36`, never truncated to 30).

- [ ] **Step 5: Database validation**

Run: `docker compose up -d postgres`
Run: `npx prisma migrate dev --name init` (if not already applied)
Run: `npx prisma studio` or a quick `npx prisma db execute --stdin <<< "select 1;"` to confirm connectivity.
Expected: connects successfully to `social_listening`.

- [ ] **Step 6: Record results**

No commit — this task is verification-only. Summarize results (build/test/DB pass or fail with exact errors) back to the user per the project's final-check list.
