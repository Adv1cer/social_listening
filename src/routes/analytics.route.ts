import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { analyticsSummaryQuerySchema } from '../schemas/analytics.schema.js';
import { computeAnalyticsSummary, fetchAnalyticsRows } from '../services/analytics.service.js';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export async function analyticsRoute(app: FastifyInstance, deps: { prisma: PrismaClient }) {
  app.get('/api/social/analytics/summary', async (request, reply) => {
    const parsed = analyticsSummaryQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'INVALID_REQUEST', details: parsed.error.flatten() });
    }

    const to = parsed.data.to ?? new Date();
    const from = parsed.data.from ?? new Date(to.getTime() - SEVEN_DAYS_MS);
    const rows = await fetchAnalyticsRows(deps.prisma, parsed.data.platform, from, to);
    const summary = computeAnalyticsSummary(rows, rows.length, from, to);
    return reply.status(200).send(summary);
  });
}
