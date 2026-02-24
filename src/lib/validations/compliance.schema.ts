import { z } from 'zod';

export const intentCheckSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, 'reason must be at least 1 character')
    .max(2000, 'reason can be at most 2000 characters'),
  assignmentId: z.string().uuid('assignmentId must be a valid UUID'),
});

export const classifySchema = z.object({
  logId: z.string().uuid('logId must be a valid UUID'),
});
