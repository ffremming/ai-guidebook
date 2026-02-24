import { z } from 'zod';

export const createResolutionSchema = z.object({
  logId: z.string().uuid('logId must be a valid UUID'),
  narrativeExplanation: z
    .string()
    .trim()
    .min(20, 'narrativeExplanation must be at least 20 characters')
    .max(20_000, 'narrativeExplanation can be at most 20000 characters'),
  disputedCategory: z
    .string()
    .trim()
    .max(100, 'disputedCategory can be at most 100 characters')
    .optional(),
  disputeEvidence: z
    .string()
    .trim()
    .max(20_000, 'disputeEvidence can be at most 20000 characters')
    .optional(),
});
