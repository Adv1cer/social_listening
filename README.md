# Social Listening Backend (V1 — TikTok)

Self-hosted backend that collects **public** TikTok data (no Apify, no paid
scraping API/proxy/SaaS, no TikTok Research API), normalizes and dedupes it,
and stores it as historical data in PostgreSQL for reuse by an external
Agentflow orchestrator (LLM analysis, Word report, dashboard).

## Requirements

- Node.js 24+
- Docker (for PostgreSQL 17)

## Setup

```bash
npm install
npx playwright install chromium
cp .env.example .env
docker compose up -d postgres
npx prisma generate
npx prisma migrate dev --name init
npm run build
npm test
```

If `DATABASE_URL` connections fail with an authentication error even though
the password is correct, another PostgreSQL instance (e.g. a native Windows
service) may already be listening on the mapped port. Check with
`netstat -ano | grep 5433` (or `5432`) and remap the port in
`docker-compose.yml` and `.env` if needed.

## Running

```bash
npm run dev      # ts-node/tsx dev server on $PORT (default 8000)
npm start        # run the built dist/server.js
```

## Manual (live) TikTok collector test

Automated tests never hit live TikTok. To try the real collector:

```bash
npm run collector:test -- --keyword "UTCC" --target 30
```

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
