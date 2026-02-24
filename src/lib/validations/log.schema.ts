import { z } from 'zod';

import {
  areValidUsageSelections,
  getUsageSectionById,
  isLeafUsageNodeId,
} from '@/lib/usage-taxonomy';

export const usageEvidenceSchema = z
  .object({
    nodeId: z.string().trim().min(1, 'nodeId is required'),
    text: z
      .string()
      .trim()
      .min(1, 'Evidence text is required')
      .max(10000, 'Evidence text can be at most 10000 characters'),
  })
  .strict();

export const createLogSchema = z.object({
  assignmentId: z.string().uuid('assignmentId must be a valid UUID'),
  usageSubsections: z
    .array(z.string().trim().min(1, 'usageSubsections items cannot be empty'))
    .min(1, 'At least one usage subsection is required')
    .max(30, 'At most 30 usage subsections can be selected'),
  usageReason: z
    .string()
    .trim()
    .max(5000, 'usageReason can be at most 5000 characters'),
  sessionDescription: z
    .string()
    .trim()
    .max(10000, 'sessionDescription can be at most 10000 characters')
    .optional()
    .or(z.literal('')),
  aiTool: z
    .string()
    .trim()
    .max(100, 'aiTool can be at most 100 characters'),
  usageEvidence: z
    .array(usageEvidenceSchema)
    .max(200, 'At most 200 evidence items are allowed'),
}).superRefine((value, ctx) => {
  if (!areValidUsageSelections(value.usageSubsections)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['usageSubsections'],
      message: 'All usageSubsections must be valid nodes in the usage tree',
    });
  }

  const selectedNodes = new Set(value.usageSubsections);
  for (const [index, evidence] of value.usageEvidence.entries()) {
    if (!selectedNodes.has(evidence.nodeId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['usageEvidence', index, 'nodeId'],
        message: 'Evidence nodeId must be one of selected usageSubsections',
      });
    }

    if (getUsageSectionById(evidence.nodeId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['usageEvidence', index, 'nodeId'],
        message: 'Evidence can only be attached to child nodes, not root categories',
      });
    }

    if (!isLeafUsageNodeId(evidence.nodeId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['usageEvidence', index, 'nodeId'],
        message: 'Evidence can only be attached to leaf nodes',
      });
    }
  }
});

export type CreateLogInput = z.infer<typeof createLogSchema>;
