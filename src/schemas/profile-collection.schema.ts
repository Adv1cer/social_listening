import { z } from 'zod';

export const profileCollectionRequestSchema = z
  .object({
    platform: z.literal('tiktok'),
    usernames: z.array(z.string().min(1)).max(20).optional(),
    targetPostsPerProfile: z.coerce.number().int().min(1).max(200).default(30),
    maxScrollsPerProfile: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export type ProfileCollectionRequest = z.infer<typeof profileCollectionRequestSchema>;

export const directUrlCollectionRequestSchema = z
  .object({
    platform: z.literal('tiktok'),
    urls: z.array(z.string().url()).min(1).max(50),
  })
  .strict();

export type DirectUrlCollectionRequest = z.infer<typeof directUrlCollectionRequestSchema>;
