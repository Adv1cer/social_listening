import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import type { AppConfig } from '../src/config/env.js';

function fakePrisma() {
  return {
    socialPost: { findMany: vi.fn(async () => []), findUnique: vi.fn(async () => null) },
    collectionRun: { findMany: vi.fn(async () => []), findUnique: vi.fn(async () => null) },
    socialComment: { findMany: vi.fn(async () => []) },
  } as never;
}

function fakeConfig(utccProfiles: string[] = [], apifyToken = '', reportApiKey = ''): AppConfig {
  return {
    port: 8000,
    databaseUrl: 'postgres://fake',
    nodeEnv: 'test',
    collector: { headless: true, maxConcurrency: 1, maxRequestsPerMinute: 10, timeoutSeconds: 120 },
    defaults: { targetPostsPerQuery: 30, maxScrollsPerQuery: 30, maxEmptyScrolls: 3 },
    tiktok: { utccProfiles, browserProfileDir: '.browser-profile/tiktok', commentMaxPerVideo: 500 },
    reports: { apiKey: reportApiKey },
    apify: { token: apifyToken, tiktokActorId: 'clockworks~tiktok-scraper' },
  };
}

describe('routes', () => {
  it('GET /api/social/health returns ok', async () => {
    const app = buildApp({ prisma: fakePrisma(), collector: { collect: vi.fn() }, config: fakeConfig() });
    const response = await app.inject({ method: 'GET', url: '/api/social/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });

  it('POST /api/social/collect rejects invalid body with 400', async () => {
    const app = buildApp({ prisma: fakePrisma(), collector: { collect: vi.fn() }, config: fakeConfig() });
    const response = await app.inject({
      method: 'POST',
      url: '/api/social/collect',
      payload: { platform: 'tiktok', keywords: [] },
    });
    expect(response.statusCode).toBe(400);
  });

  it('GET /api/social/posts returns an empty list from an empty store', async () => {
    const app = buildApp({ prisma: fakePrisma(), collector: { collect: vi.fn() }, config: fakeConfig() });
    const response = await app.inject({ method: 'GET', url: '/api/social/posts' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([]);
  });

  it('GET /api/social/posts/:id returns 404 for a missing post', async () => {
    const app = buildApp({ prisma: fakePrisma(), collector: { collect: vi.fn() }, config: fakeConfig() });
    const response = await app.inject({ method: 'GET', url: '/api/social/posts/missing' });
    expect(response.statusCode).toBe(404);
  });

  it('POST /api/social/collect/profile returns 400 when no profiles configured or supplied', async () => {
    const app = buildApp({ prisma: fakePrisma(), collector: { collect: vi.fn() }, config: fakeConfig([]) });
    const response = await app.inject({
      method: 'POST',
      url: '/api/social/collect/profile',
      payload: { platform: 'tiktok' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'NO_PROFILES_CONFIGURED' });
  });

  it('POST /api/social/collect/direct-url rejects invalid body with 400', async () => {
    const app = buildApp({ prisma: fakePrisma(), collector: { collect: vi.fn() }, config: fakeConfig() });
    const response = await app.inject({
      method: 'POST',
      url: '/api/social/collect/direct-url',
      payload: { platform: 'tiktok', urls: [] },
    });
    expect(response.statusCode).toBe(400);
  });

  it('POST /api/social/collect/hashtag returns 400 when APIFY_TOKEN is not configured', async () => {
    const app = buildApp({ prisma: fakePrisma(), collector: { collect: vi.fn() }, config: fakeConfig([], '') });
    const response = await app.inject({
      method: 'POST',
      url: '/api/social/collect/hashtag',
      payload: { platform: 'tiktok', hashtags: ['utcc'] },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'APIFY_TOKEN_NOT_CONFIGURED' });
  });

  it('POST /api/social/collect/hashtag rejects invalid body with 400', async () => {
    const app = buildApp({ prisma: fakePrisma(), collector: { collect: vi.fn() }, config: fakeConfig([], 'fake-token') });
    const response = await app.inject({
      method: 'POST',
      url: '/api/social/collect/hashtag',
      payload: { platform: 'tiktok', hashtags: [] },
    });
    expect(response.statusCode).toBe(400);
  });

  it('GET /api/social/reports/summary requires the API key when configured', async () => {
    const app = buildApp({ prisma: fakePrisma(), collector: { collect: vi.fn() }, config: fakeConfig(['eventutcc'], '', 'secret') });
    const denied = await app.inject({ method: 'GET', url: '/api/social/reports/summary' });
    expect(denied.statusCode).toBe(401);
    const ok = await app.inject({ method: 'GET', url: '/api/social/reports/summary?month=2026-08', headers: { 'x-api-key': 'secret' } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().period).toMatchObject({ label: '2026-08', from: '2026-07-31T17:00:00.000Z', to: '2026-08-31T17:00:00.000Z' });
    expect(ok.json().dataQuality.complete).toBe(false);
  });

  it('GET /api/social/reports/summary rejects out-of-scope usernames and bad params', async () => {
    const app = buildApp({ prisma: fakePrisma(), collector: { collect: vi.fn() }, config: fakeConfig(['eventutcc']) });
    expect((await app.inject({ method: 'GET', url: '/api/social/reports/summary?usernames=someoneelse' })).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/api/social/reports/summary?month=2026-13' })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: '/api/social/reports/summary?month=2026-08&from=2026-08-01' })).statusCode).toBe(400);
  });
});
