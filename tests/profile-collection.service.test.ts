import { describe, expect, it } from 'vitest';
import { assertProfileInScope } from '../src/services/profile-collection.service.js';
import { AppError } from '../src/utils/errors.js';

describe('assertProfileInScope', () => {
  it('allows any username when no allowlist is configured', () => {
    expect(() => assertProfileInScope('eventutcc', [])).not.toThrow();
  });

  it('allows a username present in the configured allowlist', () => {
    expect(() => assertProfileInScope('eventutcc', ['eventutcc', 'utccuni'])).not.toThrow();
  });

  it('rejects a username outside the configured allowlist with a 403 AppError', () => {
    expect(() => assertProfileInScope('unrelated', ['eventutcc'])).toThrow(AppError);
  });
});
