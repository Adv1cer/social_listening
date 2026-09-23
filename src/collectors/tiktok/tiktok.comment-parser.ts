// Parses TikTok's /api/comment/list JSON (captured from the page's own
// network traffic, not requested directly). Field names verified against a
// live response on 2026-09-23: comments[].cid/text/digg_count/create_time,
// top-level has_more/cursor/total/status_code.

export interface CollectedComment {
  platformCommentId: string;
  parentCommentId: string | null;
  text: string;
  likeCount: number | null;
  replyCount: number | null;
  authorUsername: string | null;
  publishedAt: Date | null;
  raw: Record<string, unknown>;
}

export interface CommentBatch {
  comments: CollectedComment[];
  hasMore: boolean;
  cursor: number | null;
  total: number | null;
}

export type CommentParseResult =
  | { type: 'batch'; batch: CommentBatch }
  | { type: 'empty_body' }
  | { type: 'invalid'; reason: string };

function num(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

export function parseCommentListBody(body: string): CommentParseResult {
  // An empty 200 body is how TikTok answers when it withholds comments
  // (observed alongside a CAPTCHA). It must never be read as "zero comments".
  if (body.trim().length === 0) return { type: 'empty_body' };

  let json: Record<string, unknown>;
  try {
    json = JSON.parse(body) as Record<string, unknown>;
  } catch {
    return { type: 'invalid', reason: 'non_json' };
  }
  const statusCode = num(json.status_code);
  if (statusCode !== null && statusCode !== 0) return { type: 'invalid', reason: `status_code_${statusCode}` };

  const rawComments = Array.isArray(json.comments) ? (json.comments as Record<string, unknown>[]) : [];
  const comments: CollectedComment[] = [];
  for (const c of rawComments) {
    const cid = typeof c.cid === 'string' ? c.cid : c.cid != null ? String(c.cid) : null;
    const text = typeof c.text === 'string' ? c.text : null;
    if (!cid || text === null) continue;
    const createTime = num(c.create_time);
    const user = (c.user ?? {}) as Record<string, unknown>;
    const replyId = c.reply_id != null && String(c.reply_id) !== '0' ? String(c.reply_id) : null;
    comments.push({
      platformCommentId: cid,
      parentCommentId: replyId,
      text,
      likeCount: num(c.digg_count),
      replyCount: num(c.reply_comment_total),
      authorUsername: typeof user.unique_id === 'string' ? user.unique_id : null,
      publishedAt: createTime !== null ? new Date(createTime * 1000) : null,
      raw: c,
    });
  }

  return {
    type: 'batch',
    batch: {
      comments,
      hasMore: num(json.has_more) === 1 || json.has_more === true,
      cursor: num(json.cursor),
      total: num(json.total),
    },
  };
}
