import { PrismaClient } from '@prisma/client';
import { buildApp } from './app.js';
import { loadEnv } from './config/env.js';
import { TikTokCollector } from './collectors/tiktok/tiktok.collector.js';
import { logger } from './utils/logger.js';

const config = loadEnv(process.env);
const prisma = new PrismaClient({ datasourceUrl: config.databaseUrl });
const collector = new TikTokCollector();

const app = buildApp({ prisma, collector, config });

app
  .listen({ port: config.port, host: '0.0.0.0' })
  .then(() => logger.info(`Server listening on port ${config.port}`))
  .catch((error) => {
    logger.error(error, 'Failed to start server');
    process.exit(1);
  });
