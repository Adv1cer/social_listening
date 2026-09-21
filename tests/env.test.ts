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
