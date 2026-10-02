import { z } from 'zod';

export const profileCollectionRequestSchema = z
  .object({
    platform: z.literal('tiktok'),
    usernames: z.array(z.string().min(1)).max(20).optional(),
    // Raised for year-filtered "whole year" scrapes; safety cap still applies.
    targetPostsPerProfile: z.coerce.number().int().min(1).max(500).default(30),
    maxScrollsPerProfile: z.coerce.number().int().min(1).max(200).default(20),
    /** When set, persist only that calendar year (UTC) and stop once older posts appear. */
    year: z.coerce.number().int().min(2016).max(2030).optional(),
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
