import { z } from 'zod';

export const analyticsSummaryQuerySchema = z.object({
  platform: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export type AnalyticsSummaryQuery = z.infer<typeof analyticsSummaryQuerySchema>;
