import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { AppConfig } from '../config/env.js';
import {
  profileCollectionRequestSchema,
  directUrlCollectionRequestSchema,
} from '../schemas/profile-collection.schema.js';
import { collectFromProfiles, collectDirectUrls } from '../services/profile-collection.service.js';
import { AppError } from '../utils/errors.js';

export async function collectProfileRoute(app: FastifyInstance, deps: { prisma: PrismaClient; config: AppConfig }) {
  app.post('/api/social/collect/profile', async (request, reply) => {
    const parsed = profileCollectionRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'INVALID_REQUEST', details: parsed.error.flatten() });
    }

    const usernames = parsed.data.usernames?.length ? parsed.data.usernames : deps.config.tiktok.utccProfiles;
    if (usernames.length === 0) {
      return reply.status(400).send({ error: 'NO_PROFILES_CONFIGURED' });
    }

    try {
      const results = await collectFromProfiles(
        deps.prisma,
        {
          usernames,
          targetPostsPerProfile: parsed.data.targetPostsPerProfile,
          maxScrollsPerProfile: parsed.data.maxScrollsPerProfile,
        },
        deps.config.tiktok.utccProfiles,
        { headless: deps.config.collector.headless, profileDir: deps.config.tiktok.browserProfileDir },
      );
      return reply.status(200).send({ runs: results });
    } catch (error) {
      if (error instanceof AppError) {
        return reply.status(error.statusCode).send({ error: error.code, message: error.message });
      }
      throw error;
    }
  });

  app.post('/api/social/collect/direct-url', async (request, reply) => {
    const parsed = directUrlCollectionRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'INVALID_REQUEST', details: parsed.error.flatten() });
    }

    const results = await collectDirectUrls(
      deps.prisma,
      { urls: parsed.data.urls },
      { headless: deps.config.collector.headless, profileDir: deps.config.tiktok.browserProfileDir },
    );
    return reply.status(200).send({ runs: results });
  });
}
