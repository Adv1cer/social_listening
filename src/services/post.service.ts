import type { PrismaClient } from '@prisma/client';
import { upsertAuthor } from '../repositories/author.repository.js';
import { upsertPost } from '../repositories/post.repository.js';
import { appendMetricSnapshotIfChanged } from '../repositories/metrics.repository.js';
import type { CollectedPost } from '../types/social.types.js';

export interface PersistPostResult {
  created: boolean;
  metricsChanged: boolean;
  postRecordId: string;
}

export async function persistCollectedPost(prisma: PrismaClient, post: CollectedPost): Promise<PersistPostResult> {
  const author = await upsertAuthor(prisma, post.platform, post.author);
  const { post: postRecord, created } = await upsertPost(prisma, post.platform, author.id, post);
  const metricsChanged = await appendMetricSnapshotIfChanged(prisma, postRecord.id, post.metrics);

  return { created, metricsChanged, postRecordId: postRecord.id };
}

export interface ListPostsFilters {
  platform?: string;
  keyword?: string;
  from?: Date;
  to?: Date;
  limit: number;
  offset: number;
  sort: 'publishedAt_desc' | 'publishedAt_asc' | 'firstSeenAt_desc';
}

const SORT_MAP = {
  publishedAt_desc: { publishedAt: 'desc' as const },
  publishedAt_asc: { publishedAt: 'asc' as const },
  firstSeenAt_desc: { firstSeenAt: 'desc' as const },
};

export async function listPosts(prisma: PrismaClient, filters: ListPostsFilters) {
  return prisma.socialPost.findMany({
    where: {
      platform: filters.platform,
      text: filters.keyword ? { contains: filters.keyword, mode: 'insensitive' } : undefined,
      publishedAt:
        filters.from || filters.to
          ? { gte: filters.from, lte: filters.to }
          : undefined,
    },
    orderBy: SORT_MAP[filters.sort],
    take: filters.limit,
    skip: filters.offset,
    include: { author: true },
  });
}

export async function getPostById(prisma: PrismaClient, id: string) {
  const post = await prisma.socialPost.findUnique({
    where: { id },
    include: {
      author: true,
      metrics: { orderBy: { capturedAt: 'desc' } },
    },
  });
  if (!post) return null;

  const [latestMetrics, ...metricsHistory] = post.metrics;
  return { post, author: post.author, latestMetrics: latestMetrics ?? null, metricsHistory };
}
