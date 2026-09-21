import Fastify, { type FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { SocialCollector } from './collectors/collector.interface.js';
import { healthRoute } from './routes/health.route.js';
import { collectRoute } from './routes/collect.route.js';
import { postsRoute } from './routes/posts.route.js';
import { analyticsRoute } from './routes/analytics.route.js';
import { runsRoute } from './routes/runs.route.js';

export interface AppDeps {
  prisma: PrismaClient;
  collector: SocialCollector;
}

export function buildApp(deps: AppDeps): FastifyInstance {
  const app = Fastify({ logger: false });

  app.register(healthRoute);
  app.register((instance) => collectRoute(instance, deps));
  app.register((instance) => postsRoute(instance, deps));
  app.register((instance) => analyticsRoute(instance, deps));
  app.register((instance) => runsRoute(instance, deps));

  return app;
}
