import type { PrismaClient, SocialPost } from '@prisma/client';
import type { CollectedPost, Platform } from '../types/social.types.js';

export interface UpsertPostResult {
  post: SocialPost;
  created: boolean;
}

export async function upsertPost(
  prisma: PrismaClient,
  platform: Platform,
  authorRecordId: string | null,
  post: CollectedPost,
): Promise<UpsertPostResult> {
  const now = new Date();
  const where = { platform_platformPostId: { platform, platformPostId: post.platformPostId } };

  const existing = await prisma.socialPost.findUnique({ where });

  const record = await prisma.socialPost.upsert({
    where,
    create: {
      platform,
      platformPostId: post.platformPostId,
      url: post.url,
      authorId: authorRecordId,
      text: post.text,
      hashtags: post.hashtags,
      publishedAt: post.publishedAt ? new Date(post.publishedAt) : null,
      firstSeenAt: now,
      lastSeenAt: now,
    },
    update: {
      url: post.url,
      authorId: authorRecordId,
      text: post.text,
      hashtags: post.hashtags,
      lastSeenAt: now,
    },
  });

  return { post: record, created: existing === null };
}
