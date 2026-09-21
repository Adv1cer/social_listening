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
