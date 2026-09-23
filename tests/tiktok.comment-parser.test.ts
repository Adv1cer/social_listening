import { describe, expect, it } from 'vitest';
import { parseCommentListBody } from '../src/collectors/tiktok/tiktok.comment-parser.js';

const body = JSON.stringify({
  status_code: 0,
  has_more: 1,
  cursor: 20,
  total: 42,
  comments: [
    { cid: '7446769834232201991', text: 'ดีงาม โปรเจคจบ', digg_count: 1, create_time: 1733836218, reply_comment_total: 2, reply_id: '0', user: { unique_id: 'someone' } },
    { cid: '7444616398602666760', text: 'น่าไปมากค้าบบ', digg_count: 0, create_time: 1733334834 },
    { text: 'missing cid is skipped' },
  ],
});

describe('parseCommentListBody', () => {
  it('parses comments and pagination fields', () => {
    const r = parseCommentListBody(body);
    expect(r.type).toBe('batch');
    if (r.type !== 'batch') return;
    expect(r.batch).toMatchObject({ hasMore: true, cursor: 20, total: 42 });
    expect(r.batch.comments).toHaveLength(2);
    expect(r.batch.comments[0]).toMatchObject({
      platformCommentId: '7446769834232201991',
      text: 'ดีงาม โปรเจคจบ',
      likeCount: 1,
      replyCount: 2,
      parentCommentId: null,
      authorUsername: 'someone',
      publishedAt: new Date(1733836218 * 1000),
    });
  });

  it('treats an empty 200 body as withheld, never as zero comments', () => {
    expect(parseCommentListBody('')).toEqual({ type: 'empty_body' });
  });

  it('rejects non-JSON and non-zero status codes', () => {
    expect(parseCommentListBody('<html>')).toEqual({ type: 'invalid', reason: 'non_json' });
    expect(parseCommentListBody('{"status_code":8}')).toEqual({ type: 'invalid', reason: 'status_code_8' });
  });

  it('reports hasMore=false when has_more is 0', () => {
    const r = parseCommentListBody('{"status_code":0,"has_more":0,"comments":[]}');
    expect(r.type === 'batch' && r.batch.hasMore).toBe(false);
  });
});
