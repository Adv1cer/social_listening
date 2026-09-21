import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { SocialCollector } from '../collectors/collector.interface.js';
import { collectionRequestSchema } from '../schemas/collection.schema.js';
import { runCollection } from '../services/collection.service.js';

export async function collectRoute(app: FastifyInstance, deps: { prisma: PrismaClient; collector: SocialCollector }) {
  app.post('/api/social/collect', async (request, reply) => {
    const parsed = collectionRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'INVALID_REQUEST', details: parsed.error.flatten() });
    }

    const result = await runCollection(deps.prisma, deps.collector, parsed.data);
    return reply.status(200).send(result);
  });
}
