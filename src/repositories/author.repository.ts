import type { PrismaClient, SocialAuthor } from '@prisma/client';
import type { CollectedAuthor, Platform } from '../types/social.types.js';

export async function upsertAuthor(
  prisma: PrismaClient,
  platform: Platform,
  author: CollectedAuthor,
): Promise<SocialAuthor> {
  const now = new Date();

  if (author.platformAuthorId) {
    return prisma.socialAuthor.upsert({
      where: { platform_platformAuthorId: { platform, platformAuthorId: author.platformAuthorId } },
      create: {
        platform,
        platformAuthorId: author.platformAuthorId,
        username: author.username,
        displayName: author.displayName,
        profileUrl: author.profileUrl,
        verified: author.verified,
        firstSeenAt: now,
        lastSeenAt: now,
      },
      update: {
        username: author.username,
        displayName: author.displayName,
        profileUrl: author.profileUrl,
        verified: author.verified,
        lastSeenAt: now,
      },
    });
  }

  const existing = await prisma.socialAuthor.findFirst({
    where: { platform, platformAuthorId: null, username: author.username },
  });

  if (existing) {
    return prisma.socialAuthor.update({
      where: { id: existing.id },
      data: {
        displayName: author.displayName,
        profileUrl: author.profileUrl,
        verified: author.verified,
        lastSeenAt: now,
      },
    });
  }

  return prisma.socialAuthor.create({
    data: {
      platform,
      platformAuthorId: null,
      username: author.username,
      displayName: author.displayName,
      profileUrl: author.profileUrl,
      verified: author.verified,
      firstSeenAt: now,
      lastSeenAt: now,
    },
  });
}
