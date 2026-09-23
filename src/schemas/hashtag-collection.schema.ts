import { z } from 'zod';

export const hashtagCollectionRequestSchema = z
  .object({
    platform: z.literal('tiktok'),
    hashtags: z
      .array(z.string().min(1))
      .min(1)
      .max(20)
      .transform((values) => [...new Set(values.map((v) => v.trim()).filter((v) => v.length > 0))]),
    resultsPerPage: z.coerce.number().int().min(1).max(200).default(30),
  })
  .strict();

export type HashtagCollectionRequest = z.infer<typeof hashtagCollectionRequestSchema>;
