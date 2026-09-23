# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev                        # tsx watch server, loads .env
npm run build                      # tsc -p tsconfig.json
npm start                          # run compiled dist/server.js, loads .env
npm test                           # vitest run (single run)
npm run test:watch                 # vitest watch mode
npx vitest run tests/foo.test.ts   # run a single test file
npm run prisma:generate            # regenerate Prisma client after schema.prisma changes
npm run prisma:migrate             # create/apply a dev migration
npm run collector:test             # scripts/test-tiktok-collector.ts, opt-in live TikTok search collector run
npm run collector:profile:test     # scripts/test-profile-collector.ts, opt-in live TikTok profile collector run
```

Manual collector scripts under `scripts/` hit live TikTok and are not run by CI/tests — they require `.env` (loaded via `--env-file`) and are for local diagnostics only.

## Architecture

Fastify + Prisma + Playwright/Crawlee backend that collects TikTok posts via three independent collection strategies and stores them in Postgres.

**Request flow**: `src/server.ts` loads env, constructs Prisma client and a `TikTokCollector`, then calls `buildApp` (`src/app.ts`) which registers each route module with `{ prisma, collector, config }` deps (`AppDeps`). Routes live in `src/routes/*.route.ts`, one file per endpoint group, each a Fastify plugin function.

**Three collection sources**, each with its own service, feeding a shared persistence path:
- **Keyword/search** (`src/collectors/tiktok/tiktok.collector.ts`, `collect.route.ts`): drives a `PlaywrightCrawler` against TikTok search pages. `runCollectionLoop` in the same file is the generic scroll/paginate/dedupe/stop-condition loop, decoupled from Playwright via the `BatchLoader` interface — test it directly with a fake loader instead of mocking Crawlee.
- **Profile** (`tiktok.profile-discovery.ts`, `tiktok.video-detail.ts`, `tiktok.video-enricher.ts`, `profile-collection.service.ts`, `collect-profile.route.ts`): scrolls a profile page to discover video URLs via DOM, then enriches each by extracting `__UNIVERSAL_DATA_FOR_REHYDRATION__` (embedded JSON) from the direct video page — this avoids CAPTCHA gates that block profile-page API interception. Allowlist gate is `TIKTOK_UTCC_PROFILES` in `AppConfig.tiktok.utccProfiles`; request body usernames take precedence, falling back to the configured allowlist when omitted, and an empty allowlist accepts any requested usernames.
- **Hashtag** (`tiktok.apify-client.ts`, `tiktok.apify-normalizer.ts`, `apify-collection.service.ts`, `collect-hashtag.route.ts`): delegates to the Apify REST API (actor configured via `APIFY_TIKTOK_ACTOR_ID`, default `clockworks~tiktok-hashtag-scraper`) instead of in-process browser automation, since TikTok hashtag pages don't expose queryable DOM video links.

All three normalize into the collector-agnostic `CollectedPost` shape (`src/types/social.types.ts`), tagged with `collectionSource: 'profile' | 'direct_url' | 'hashtag' | 'keyword'`, then persist through `persistCollectedPost` (`src/services/post.service.ts`) which upserts `SocialAuthor`/`SocialPost` and appends a `SocialMetric` snapshot — metrics are append-only time series, not overwritten, so historical engagement is queryable. `CollectionRun` rows (`collection-run.repository.ts`) track each run's lifecycle (started/finished, counts, stop reason, error).

**Block detection**: `tiktok.block-detector.ts` classifies a fetched page as ok/captcha/blocked/etc. from evidence in the HTML rather than a single naive signal — see `tiktok.block-detector.test.ts` for the evidence contract before changing it.

**Config**: all env vars are parsed and defaulted once in `src/config/env.ts` (`loadEnv`, Zod schema) into a typed `AppConfig`; nothing reads `process.env` directly elsewhere.

**Prisma models** (`prisma/schema.prisma`): `SocialAuthor` 1—N `SocialPost` 1—N `SocialMetric`, plus standalone `CollectionRun` for run auditing. Platform is a free-text string (`'tiktok'` today) rather than an enum, anticipating other platforms.

## Testing conventions

Tests mirror `src/` one-to-one under `tests/*.test.ts` (flat, not nested). Unit tests for parsing/normalization/block-detection use fixture HTML/JSON inline; collector-loop logic is tested via the `BatchLoader` interface rather than mocking Playwright/Crawlee; route tests (`routes.test.ts`) build the app via `buildApp` with fake `prisma`/`collector` deps.
