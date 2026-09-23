import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { timingSafeEqual } from 'node:crypto';
import type { AppConfig } from '../config/env.js';
import { reportSummaryQuerySchema } from '../schemas/report.schema.js';
import { buildReport, fetchReportData, monthPeriod, previousMonthPeriod } from '../services/report.service.js';

function keyMatches(given: unknown, expected: string): boolean {
  if (typeof given !== 'string') return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function reportRoute(app: FastifyInstance, deps: { prisma: PrismaClient; config: AppConfig }) {
  app.get('/api/social/reports/summary', async (request, reply) => {
    const apiKey = deps.config.reports.apiKey;
    if (apiKey && !keyMatches(request.headers['x-api-key'], apiKey)) {
      return reply.status(401).send({ error: 'UNAUTHORIZED' });
    }

    const parsed = reportSummaryQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'INVALID_REQUEST', details: parsed.error.flatten() });
    }
    const q = parsed.data;

    const allowlist = deps.config.tiktok.utccProfiles;
    const usernames = q.usernames ?? allowlist;
    if (usernames.length === 0) return reply.status(400).send({ error: 'NO_PROFILES_CONFIGURED' });
    const outOfScope = allowlist.length > 0 ? usernames.filter((u) => !allowlist.includes(u)) : [];
    if (outOfScope.length > 0) return reply.status(403).send({ error: 'PROFILE_OUT_OF_SCOPE', usernames: outOfScope });

    const now = new Date();
    const period = q.month
      ? monthPeriod(q.month)
      : q.from && q.to
        ? { from: q.from, to: q.to, label: `${q.from.toISOString()}..${q.to.toISOString()}` }
        : previousMonthPeriod(now);

    const data = await fetchReportData(deps.prisma, usernames, period);
    return reply.status(200).send(
      buildReport({ period, usernames, ...data, maxComments: q.maxComments, generatedAt: now }),
    );
  });
}
