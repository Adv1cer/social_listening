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
