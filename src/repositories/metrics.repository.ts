import type { PrismaClient } from '@prisma/client';
import type { CollectedMetrics } from '../types/social.types.js';

export interface MetricSnapshot {
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
}

export function hasMetricsChanged(latest: MetricSnapshot | null, next: CollectedMetrics): boolean {
  if (latest === null) return true;
  return (
    latest.views !== next.views ||
    latest.likes !== next.likes ||
    latest.comments !== next.comments ||
    latest.shares !== next.shares ||
    latest.saves !== next.saves
  );
}

export async function appendMetricSnapshotIfChanged(
  prisma: PrismaClient,
  postId: string,
  metrics: CollectedMetrics,
): Promise<boolean> {
  const latest = await prisma.socialMetric.findFirst({
    where: { postId },
    orderBy: { capturedAt: 'desc' },
  });

  if (!hasMetricsChanged(latest, metrics)) return false;

  await prisma.socialMetric.create({
    data: {
      postId,
      views: metrics.views,
      likes: metrics.likes,
      comments: metrics.comments,
      shares: metrics.shares,
      saves: metrics.saves,
    },
  });
  return true;
}
