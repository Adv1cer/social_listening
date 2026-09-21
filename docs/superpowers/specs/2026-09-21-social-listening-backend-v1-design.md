# Social Listening Backend V1 — Design Spec

Date: 2026-09-21
Status: Approved by user (explicit "เริ่ม implement ได้เลย")

## 1. Purpose

Self-hosted backend that collects **public** TikTok data (no Apify, no paid
scraping API, no paid proxy, no scraping SaaS, no TikTok Research API, no
login/CAPTCHA/access-control bypass), stores it as historical data in
PostgreSQL for reuse, and exposes it via an Analytics API for an external
Agentflow orchestrator to drive LLM analysis and report generation.

Pipeline:

```
TikTok Public Data → TikTok Collector → Normalize → Deduplicate → PostgreSQL
   → Analytics API → Agentflow → LLM Analysis → Word Report / Dashboard
```

Scraped data is a durable historical asset, not scrape-then-discard.

## 2. Hard Constraints

- No Apify, no paid scraping API, no paid proxy, no scraping SaaS, no TikTok
  Research API.
- Public data only. No login bypass, no CAPTCHA bypass, no access-control
  bypass. No fabricated data. Missing field → `null`.
- TikTok block must surface as an explicit error (`COLLECTOR_BLOCKED`), never
  silently fabricated or retried past limits.
- Self-hostable via Docker. PostgreSQL only (no MySQL).
- Layering: Collector ≠ API layer, Parser ≠ Collector, Business logic ≠
  Route handlers.

## 3. Collection Target Semantics (core behavioral contract)

`targetPostsPerQuery` / `targetTotalPosts` are **desired minimums**, not hard
caps:

- Collector loads batches (scroll/page) until collected count ≥ target, then
  stops requesting more batches — but keeps the *entire* last batch (never
  `slice(0, target)`).
- Example: target 30, batches 12/13/11 → returns all 36.
- `targetTotalPosts` behaves the same way across the set of per-keyword runs:
  once the running total ≥ targetTotalPosts, no new keyword query starts, but
  an in-flight query still finishes its batch.
- If TikTok has fewer results than the target, return what exists — never
  fabricate to reach the target.
- Safety limits (`maxScrollsPerQuery`, `maxCollectionTimePerQuerySeconds`,
  `maxConsecutiveEmptyScrolls`) bound worst-case runtime; they are not part of
  the "target" semantics, they exist purely to guarantee termination.

Stop conditions (first one wins): target reached · empty-scroll limit ·
scroll limit · timeout · TikTok block · no results on page.

## 4. Tech Stack

Node.js 24, TypeScript, Fastify, Crawlee + Playwright (Chromium), Prisma ORM,
PostgreSQL 17, Zod, Docker/Docker Compose, Vitest.

## 5. Architecture

```
Agentflow → POST /api/social/collect → Fastify → Collection Service
  → TikTok Collector (Crawlee+Playwright) → Parser → Normalizer
  → Dedup/Upsert → PostgreSQL → {Posts API, Analytics API} → Agentflow
  → LLM Analysis → Word Report / Dashboard
```

Project layout as specified by the user (routes / collectors / services /
repositories / schemas / types / utils, prisma/, tests/, scripts/) — see
section 8 of the original request, adopted as-is.

## 6. Data Model (Prisma / PostgreSQL)

- **SocialAuthor** — `platform + platformAuthorId` unique; identity +
  first/lastSeenAt tracking.
- **SocialPost** — `platform + platformPostId` unique; text, hashtags
  (JSONB), optional rawMetadata (JSONB, must never contain cookies, tokens,
  credentials, sessions, or full-page HTML), first/lastSeenAt. Indexes on
  platform, publishedAt, firstSeenAt, lastSeenAt.
- **SocialMetric** — nullable integer fields (views/likes/comments/shares/
  saves): `0` means "observed zero", `null` means "not observed". Append-only
  time series per post — historical snapshots are never overwritten.
- **CollectionRun** — one row per keyword query per collection request:
  target vs. actual counts, timing, `status`
  (running/completed/partial/failed), `stopReason`
  (target_reached/no_more_results/empty_scroll_limit/scroll_limit/timeout/
  blocked/error), error code/message.

## 7. Collector Interface

```ts
interface SocialCollector {
  collect(input: CollectorInput): Promise<CollectorResult>;
}
```

`CollectorInput` carries query + target + safety limits.
`CollectorResult` carries posts, scanned/returned counts, targetReached,
stopReason. `TikTokCollector` implements this; future platforms
(YouTube/Facebook/X/Pantip/News) implement the same interface — not built in
V1, but the interface must not preclude them.

## 8. APIs

- `POST /api/social/collect` — triggers collection across keywords, returns
  per-run summary (target vs. found is expected to diverge — found > target
  is normal, never an error).
- `GET /api/social/posts`, `GET /api/social/posts/:id` (+ author + metrics
  history).
- `GET /api/social/runs`, `GET /api/social/runs/:id`.
- `GET /api/social/analytics/summary` — backend-computed aggregates (totals,
  engagement sums, top hashtags/posts, daily mentions). No LLM involved in
  computing these numbers; LLM only interprets the precomputed summary
  (sentiment, topics, risk, executive summary, recommendations) downstream in
  Agentflow, outside this backend's scope.

All request bodies validated with Zod per the limits specified in section 16
of the original request (keyword count 1–20, targetPostsPerQuery 1–1000
default 30, etc.).

## 9. Parser / Selector Maintainability

All TikTok DOM selectors live in `tiktok.selectors.ts` only. Any selector not
verified against live TikTok is marked `TODO: VERIFY_WITH_LIVE_TIKTOK` and
must not be claimed production-ready. Metric string parser handles
`100/1K/1.2K/10K/1M/1.5M/1B` → integer, returns `null` on unparseable input.
Block detection (CAPTCHA/login wall/access denied/rate limit/unavailable)
throws `COLLECTOR_BLOCKED` — never bypassed.

## 10. Testing

Vitest, fixture-based (no live TikTok in automated tests). Must cover: metric
parser, hashtag extraction, parser, normalizer, dedup (in-collection and
DB-level), metric snapshot rules, target/overshoot logic (30 target / 12+13+11
batches → 36 returned, `targetReached=true` — asserting exactly 30 is a test
bug), empty-scroll and timeout stop conditions, CollectionRun, analytics
aggregation. A manual/live script (`npm run collector:test`) exists separately
for opt-in real-TikTok verification.

## 11. Out of Scope for V1

YouTube/Facebook/X/Pantip/News collectors (interface must accommodate them
later), Agentflow itself (external system — this backend only exposes HTTP
endpoints for it to call), LLM analysis and Word report generation (Agentflow
/ downstream responsibility).
