import { z } from 'zod';

export const listPostsQuerySchema = z.object({
  platform: z.string().optional(),
  keyword: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  sort: z.enum(['publishedAt_desc', 'publishedAt_asc', 'firstSeenAt_desc']).default('publishedAt_desc'),
});

export type ListPostsQuery = z.infer<typeof listPostsQuerySchema>;
