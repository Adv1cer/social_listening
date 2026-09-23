import { describe, expect, it } from 'vitest';
import {
  isCommentCollectionComplete,
  runCommentLoop,
  type CommentPageDriver,
} from '../src/collectors/tiktok/tiktok.comment-collector.js';
import type { CommentParseResult } from '../src/collectors/tiktok/tiktok.comment-parser.js';

function batch(ids: string[], hasMore: boolean, total: number | null = null): CommentParseResult {
  return {
    type: 'batch',
    batch: {
      hasMore,
      cursor: null,
      total,
      comments: ids.map((id) => ({
        platformCommentId: id, parentCommentId: null, text: id, likeCount: 0,
        replyCount: 0, authorUsername: null, publishedAt: null, raw: {},
      })),
    },
  };
}

function fakeDriver(responses: (CommentParseResult | null)[], opts: { open?: 'ok' | 'captcha' | 'unavailable'; captchaAfter?: number } = {}): CommentPageDriver {
  let i = 0;
  return {
    open: async () => opts.open ?? 'ok',
    nextResponse: async () => (i < responses.length ? responses[i++] : null),
    isCaptchaVisible: async () => opts.captchaAfter !== undefined && i >= opts.captchaAfter,
  };
}

const opts = { maxComments: 100, maxEmptyWaits: 2 };

describe('runCommentLoop', () => {
  it('paginates until has_more is false and dedupes by cid', async () => {
    const r = await runCommentLoop(fakeDriver([batch(['a', 'b'], true, 3), batch(['b', 'c'], false, 3)]), 'u', opts);
    expect(r.stopReason).toBe('no_more_results');
    expect(r.comments.map((c) => c.platformCommentId)).toEqual(['a', 'b', 'c']);
    expect(r.pages).toBe(2);
    expect(isCommentCollectionComplete(r)).toBe(true);
  });

  it('stops at maxComments', async () => {
    const r = await runCommentLoop(fakeDriver([batch(['a', 'b', 'c'], true)]), 'u', { ...opts, maxComments: 2 });
    expect(r.stopReason).toBe('target_reached');
  });

  it('reports captcha on open and does not read comments', async () => {
    const r = await runCommentLoop(fakeDriver([batch(['a'], false)], { open: 'captcha' }), 'u', opts);
    expect(r.stopReason).toBe('captcha');
    expect(r.comments).toHaveLength(0);
    expect(isCommentCollectionComplete(r)).toBe(false);
  });

  it('reports captcha when an empty body is followed by a visible challenge', async () => {
    const r = await runCommentLoop(fakeDriver([{ type: 'empty_body' }], { captchaAfter: 1 }), 'u', opts);
    expect(r.stopReason).toBe('captcha');
  });

  it('never reports withheld comments as a complete zero', async () => {
    const r = await runCommentLoop(fakeDriver([{ type: 'empty_body' }, null]), 'u', opts);
    expect(r.stopReason).toBe('comments_withheld');
    expect(isCommentCollectionComplete(r)).toBe(false);
  });

  it('marks a run incomplete when far fewer comments than total were collected', async () => {
    const r = await runCommentLoop(fakeDriver([batch(['a'], true, 50), null, null]), 'u', opts);
    expect(r.stopReason).toBe('empty_scroll_limit');
    expect(isCommentCollectionComplete(r)).toBe(false);
  });

  it('treats has_more=0 as complete even when total is higher (total overcounts)', async () => {
    const r = await runCommentLoop(fakeDriver([batch(['a'], false, 50)]), 'u', opts);
    expect(r.reportedTotal).toBe(50);
    expect(isCommentCollectionComplete(r)).toBe(true);
  });
});
