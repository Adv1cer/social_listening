import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { AppConfig } from '../config/env.js';
import { hashtagCollectionRequestSchema } from '../schemas/hashtag-collection.schema.js';
import { collectFromHashtagsViaApify } from '../services/apify-collection.service.js';

export async function collectHashtagRoute(app: FastifyInstance, deps: { prisma: PrismaClient; config: AppConfig }) {
  app.post('/api/social/collect/hashtag', async (request, reply) => {
    const parsed = hashtagCollectionRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'INVALID_REQUEST', details: parsed.error.flatten() });
    }

    if (!deps.config.apify.token) {
      return reply.status(400).send({ error: 'APIFY_TOKEN_NOT_CONFIGURED' });
    }

    const results = await collectFromHashtagsViaApify(
      deps.prisma,
      { hashtags: parsed.data.hashtags, resultsPerPage: parsed.data.resultsPerPage },
      { token: deps.config.apify.token, actorId: deps.config.apify.tiktokActorId },
    );
    return reply.status(200).send({ runs: results });
  });
}
