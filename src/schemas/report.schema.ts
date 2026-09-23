import { z } from 'zod';

export const reportSummaryQuerySchema = z
  .object({
    // Comma-separated TikTok usernames; falls back to TIKTOK_UTCC_PROFILES.
    usernames: z
      .string()
      .optional()
      .transform((v) => (v ? v.split(',').map((s) => s.trim()).filter((s) => s.length > 0) : undefined)),
    // Either an explicit [from, to) range, or a calendar month "YYYY-MM"
    // (Asia/Bangkok). Omitting both means the previous full month.
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'month must be YYYY-MM').optional(),
    maxComments: z.coerce.number().int().positive().max(1000).default(300),
  })
  .refine((q) => !(q.month && (q.from || q.to)), { message: 'use either month or from/to, not both' })
  .refine((q) => (q.from === undefined) === (q.to === undefined), { message: 'from and to must be given together' })
  .refine((q) => !q.from || !q.to || q.from < q.to, { message: 'from must be before to' });

export type ReportSummaryQuery = z.infer<typeof reportSummaryQuerySchema>;
