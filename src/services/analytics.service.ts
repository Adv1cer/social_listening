import type { PrismaClient } from '@prisma/client';

export interface AnalyticsRow {
  postId: string;
  text: string | null;
  hashtags: string[];
  publishedAt: Date | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  url: string;
}

export interface AnalyticsSummary {
  period: { from: string; to: string };
  posts: { total: number; new: number };
  engagement: { views: number; likes: number; comments: number; shares: number; saves: number };
  topHashtags: Array<{ tag: string; count: number }>;
  topPosts: Array<{ postId: string; url: string; views: number }>;
  dailyMentions: Array<{ date: string; count: number }>;
}

function sum(rows: AnalyticsRow[], key: keyof Pick<AnalyticsRow, 'views' | 'likes' | 'comments' | 'shares' | 'saves'>) {
  return rows.reduce((total, row) => total + (row[key] ?? 0), 0);
}

export function computeAnalyticsSummary(
  rows: AnalyticsRow[],
  newCount: number,
  from: Date,
  to: Date,
): AnalyticsSummary {
  const hashtagCounts = new Map<string, number>();
  for (const row of rows) {
    for (const tag of row.hashtags) {
      hashtagCounts.set(tag, (hashtagCounts.get(tag) ?? 0) + 1);
    }
  }
  const topHashtags = [...hashtagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([tag, count]) => ({ tag, count }));

  const topPosts = [...rows]
    .sort((a, b) => (b.views ?? -1) - (a.views ?? -1))
    .slice(0, 10)
    .map((row) => ({ postId: row.postId, url: row.url, views: row.views ?? 0 }));

  const dailyCounts = new Map<string, number>();
  for (const row of rows) {
    if (!row.publishedAt) continue;
    const date = row.publishedAt.toISOString().slice(0, 10);
    dailyCounts.set(date, (dailyCounts.get(date) ?? 0) + 1);
  }
  const dailyMentions = [...dailyCounts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, count]) => ({ date, count }));

  return {
    period: { from: from.toISOString(), to: to.toISOString() },
    posts: { total: rows.length, new: newCount },
    engagement: {
      views: sum(rows, 'views'),
      likes: sum(rows, 'likes'),
      comments: sum(rows, 'comments'),
      shares: sum(rows, 'shares'),
      saves: sum(rows, 'saves'),
    },
    topHashtags,
    topPosts,
    dailyMentions,
  };
}

export async function fetchAnalyticsRows(
  prisma: PrismaClient,
  platform: string | undefined,
  from: Date,
  to: Date,
): Promise<AnalyticsRow[]> {
  const posts = await prisma.socialPost.findMany({
    where: {
      platform,
      firstSeenAt: { gte: from, lte: to },
    },
    include: { metrics: { orderBy: { capturedAt: 'desc' }, take: 1 } },
  });

  return posts.map((post) => {
    const latest = post.metrics[0];
    return {
      postId: post.id,
      text: post.text,
      hashtags: Array.isArray(post.hashtags) ? (post.hashtags as string[]) : [],
      publishedAt: post.publishedAt,
      views: latest?.views ?? null,
      likes: latest?.likes ?? null,
      comments: latest?.comments ?? null,
      shares: latest?.shares ?? null,
      saves: latest?.saves ?? null,
      url: post.url,
    };
  });
}
