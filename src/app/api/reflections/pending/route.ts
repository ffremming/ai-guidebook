import { NextResponse } from 'next/server';
import { EnrollmentRole, UserRole } from '@prisma/client';
import { Prisma } from '@prisma/client';

import { AuthError } from '@/lib/auth/errors';
import { getRequiredSession } from '@/lib/auth/session';
import { prisma } from '@/lib/db/client';
import { isReflectionTriggerType } from '@/lib/reflections/prompts';

export async function GET(request: Request) {
  try {
    const session = await getRequiredSession(request);
    if (session.user.role !== UserRole.STUDENT) {
      return NextResponse.json({ error: 'Student role required' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const assignmentId = searchParams.get('assignmentId');
    const triggerTypeRaw = searchParams.get('triggerType');

    if (triggerTypeRaw && !isReflectionTriggerType(triggerTypeRaw)) {
      return NextResponse.json({ error: 'Invalid triggerType' }, { status: 400 });
    }
    const triggerType = isReflectionTriggerType(triggerTypeRaw) ? triggerTypeRaw : undefined;

    if (assignmentId) {
      const assignment = await prisma.assignment.findUnique({
        where: { id: assignmentId },
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
    }

    const entries = await prisma.reflectionJournalEntry.findMany({
      where: {
        userId: session.user.id,
        status: 'REQUIRED',
        ...(assignmentId ? { assignmentId } : {}),
        ...(triggerType ? { triggerType } : {}),
      },
      orderBy: [{ createdAt: 'desc' }],
      select: {
        id: true,
        assignmentId: true,
        triggerType: true,
        status: true,
        requiredForUnlock: true,
        createdAt: true,
      },
    });

    const blockingEntry =
      entries.find(
        (entry) => entry.triggerType === 'COMPLIANCE_SERIOUS' && entry.requiredForUnlock,
      ) ?? null;

    return NextResponse.json(
      {
        requiresCompletion: entries.length > 0,
        entries,
        blockingEntry,
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021') {
      return NextResponse.json(
        {
          requiresCompletion: false,
          entries: [],
          blockingEntry: null,
          reflectionFeatureUnavailable: true,
        },
        { status: 200 },
      );
    }

    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
