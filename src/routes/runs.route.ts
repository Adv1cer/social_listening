import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';

export async function runsRoute(app: FastifyInstance, deps: { prisma: PrismaClient }) {
  app.get('/api/social/runs', async (request, reply) => {
    const runs = await deps.prisma.collectionRun.findMany({ orderBy: { startedAt: 'desc' }, take: 50 });
    return reply.status(200).send(runs);
  });

  app.get<{ Params: { id: string } }>('/api/social/runs/:id', async (request, reply) => {
    const run = await deps.prisma.collectionRun.findUnique({ where: { id: request.params.id } });
    if (!run) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Run not found' });
    }
    return reply.status(200).send(run);
  });
}
