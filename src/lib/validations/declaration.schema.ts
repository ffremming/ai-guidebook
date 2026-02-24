import { z } from 'zod';

export const patchDeclarationSchema = z
  .object({
    studentRemarks: z
      .string()
      .trim()
      .max(20_000, 'studentRemarks can be at most 20000 characters')
      .nullable()
      .optional(),
  })
  .strict();
