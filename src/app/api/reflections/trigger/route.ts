import { NextResponse } from 'next/server';
import { EnrollmentRole, UserRole } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { ZodError, z } from 'zod';

import { AuthError } from '@/lib/auth/errors';
import { getRequiredSession } from '@/lib/auth/session';
import { prisma } from '@/lib/db/client';
import {
  REFLECTION_PROMPT_SET_VERSION,
  isReflectionTriggerType,
} from '@/lib/reflections/prompts';

const triggerSchema = z.object({
  assignmentId: z.string().uuid('assignmentId must be a valid UUID'),
  triggerType: z.string().refine((value) => isReflectionTriggerType(value), {
    message: 'Invalid triggerType',
  }),
});

export async function POST(request: Request) {
  try {
    const session = await getRequiredSession(request);
    if (session.user.role !== UserRole.STUDENT) {
      return NextResponse.json({ error: 'Student role required' }, { status: 403 });
    }

    const parsed = triggerSchema.parse(await request.json());

    const assignment = await prisma.assignment.findUnique({
      where: { id: parsed.assignmentId },
      select: { id: true, courseId: true },
    });

    if (!assignment) {
      return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
    }

    const enrollment = await prisma.enrollment.findFirst({
      where: {
        userId: session.user.id,
        courseId: assignment.courseId,
        role: EnrollmentRole.STUDENT,
      },
      select: { id: true },
    });

    if (!enrollment) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const triggerType = parsed.triggerType;
    const requiredForUnlock = triggerType === 'COMPLIANCE_SERIOUS';

    const entry = await prisma.reflectionJournalEntry.upsert({
      where: {
        userId_assignmentId_triggerType: {
          userId: session.user.id,
          assignmentId: parsed.assignmentId,
          triggerType,
        },
      },
      update: {
        promptSetVersion: REFLECTION_PROMPT_SET_VERSION,
        requiredForUnlock,
      },
      create: {
        userId: session.user.id,
        assignmentId: parsed.assignmentId,
        triggerType,
        promptSetVersion: REFLECTION_PROMPT_SET_VERSION,
        requiredForUnlock,
      },
      select: {
        id: true,
        assignmentId: true,
        triggerType: true,
        status: true,
        requiredForUnlock: true,
        completedAt: true,
      },
    });

    return NextResponse.json({ entry }, { status: 200 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021') {
      return NextResponse.json(
        {
          error:
            'Reflection journal is not available yet. Run database migrations and try again.',
        },
        { status: 409 },
      );
    }

    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          fields: error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
