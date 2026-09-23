import type { Prisma, PrismaClient } from '@prisma/client';
import type { CollectedComment } from '../collectors/tiktok/tiktok.comment-parser.js';

export async function upsertComment(
  prisma: PrismaClient,
  postId: string,
  comment: CollectedComment,
  source: string,
): Promise<{ created: boolean }> {
  const where = { platform_platformCommentId: { platform: 'tiktok', platformCommentId: comment.platformCommentId } };
  const existing = await prisma.socialComment.findUnique({ where, select: { id: true } });
  const data = {
    text: comment.text,
    likeCount: comment.likeCount,
    replyCount: comment.replyCount,
    authorUsername: comment.authorUsername,
    parentCommentId: comment.parentCommentId,
    publishedAt: comment.publishedAt,
    rawMetadata: comment.raw as Prisma.InputJsonValue,
  };
  if (existing) {
    // sentiment/category are intentionally not touched: they are set by the
    // classification step and must survive re-collection.
    await prisma.socialComment.update({ where, data: { ...data, lastSeenAt: new Date() } });
    return { created: false };
  }
  await prisma.socialComment.create({
    data: { ...data, platform: 'tiktok', platformCommentId: comment.platformCommentId, postId, source },
  });
  return { created: true };
}
