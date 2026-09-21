import { z } from 'zod';

export const collectionRequestSchema = z
  .object({
    platform: z.literal('tiktok'),
    keywords: z
      .array(z.string())
      .min(1)
      .max(20)
      .transform((values) => {
        const cleaned = values.map((v) => v.trim()).filter((v) => v.length > 0);
        return [...new Set(cleaned)];
      })
      .refine((values) => values.length >= 1, 'At least one non-empty keyword is required'),
    targetPostsPerQuery: z.coerce.number().int().min(1).max(1000).default(30),
    targetTotalPosts: z.coerce.number().int().min(1).optional(),
    maxScrollsPerQuery: z.coerce.number().int().min(1).max(200).default(30),
    maxCollectionTimePerQuerySeconds: z.coerce.number().int().min(10).max(600).default(120),
    maxConsecutiveEmptyScrolls: z.coerce.number().int().min(1).max(20).default(3),
  })
  .strict();

export type CollectionRequest = z.infer<typeof collectionRequestSchema>;
