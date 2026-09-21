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
