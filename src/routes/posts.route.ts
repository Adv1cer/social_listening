import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { listPostsQuerySchema } from '../schemas/post.schema.js';
import { listPosts, getPostById } from '../services/post.service.js';

export async function postsRoute(app: FastifyInstance, deps: { prisma: PrismaClient }) {
  app.get('/api/social/posts', async (request, reply) => {
    const parsed = listPostsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'INVALID_REQUEST', details: parsed.error.flatten() });
    }
    const posts = await listPosts(deps.prisma, parsed.data);
    return reply.status(200).send(posts);
  });

  app.get<{ Params: { id: string } }>('/api/social/posts/:id', async (request, reply) => {
    const result = await getPostById(deps.prisma, request.params.id);
    if (!result) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Post not found' });
    }
    return reply.status(200).send(result);
  });
}
