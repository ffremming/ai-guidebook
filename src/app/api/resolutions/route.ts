import { NextResponse } from 'next/server';
import { Prisma, ResolutionStatus, UserRole } from '@prisma/client';
import { ZodError } from 'zod';

import { writeAuditLog } from '@/lib/audit/logger';
import { AuthError } from '@/lib/auth/errors';
import { getRequiredSession } from '@/lib/auth/session';
import { prisma } from '@/lib/db/client';
import { createResolutionSchema } from '@/lib/validations/resolution.schema';

function clientIp(request: Request): string | undefined {
  const forwarded = request.headers.get('x-forwarded-for');
  if (!forwarded) {
    return undefined;
  }

  return forwarded.split(',')[0]?.trim() || undefined;
}

function formatValidationErrors(error: ZodError) {
  const fields: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'root';
    if (!fields[key]) {
      fields[key] = [];
    }
    fields[key].push(issue.message);
  }
  return fields;
}

export async function POST(request: Request) {
  try {
    const session = await getRequiredSession(request);
    if (session.user.role !== UserRole.STUDENT) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = createResolutionSchema.parse(await request.json());

    const log = await prisma.aiLog.findUnique({
      where: { id: body.logId },
      select: {
        id: true,
        userId: true,
        assignmentId: true,
        actualUsageCategory: true,
        resolutionStatus: true,
        conflictFlag: true,
        directViolationFlag: true,
      },
    });

    if (!log) {
      return NextResponse.json({ error: 'Log not found' }, { status: 404 });
    }

    if (log.userId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (log.resolutionStatus !== ResolutionStatus.UNRESOLVED) {
      return NextResponse.json({ error: 'Log is not unresolved' }, { status: 409 });
    }

    if (!log.actualUsageCategory) {
      return NextResponse.json(
        { error: 'Cannot submit resolution before system classification' },
        { status: 409 },
      );
    }
    const originalSystemCategory = log.actualUsageCategory;

    const result = await prisma.$transaction(async (tx) => {
      const created = await tx.resolution.create({
        data: {
          aiLogId: log.id,
          userId: session.user.id,
          narrativeExplanation: body.narrativeExplanation,
          disputedCategory: body.disputedCategory ?? null,
          disputeEvidence: body.disputeEvidence ?? null,
          originalSystemCategory,
        },
        select: {
          id: true,
          aiLogId: true,
          originalSystemCategory: true,
          submittedAt: true,
        },
      });

      await tx.aiLog.update({
        where: { id: log.id },
        data: {
          resolutionStatus: ResolutionStatus.STUDENT_RESPONDED,
        },
      });

      return created;
    });

    await writeAuditLog({
      actorId: session.user.id,
      actionType: 'RESOLUTION_SUBMITTED',
      resourceType: 'resolution',
      resourceId: result.id,
      metadataJson: {
        logId: result.aiLogId,
        originalSystemCategory: result.originalSystemCategory,
      },
      ipAddress: clientIp(request),
    });

    return NextResponse.json(
      {
        resolutionId: result.id,
        logResolutionStatus: ResolutionStatus.STUDENT_RESPONDED,
        originalSystemCategory: result.originalSystemCategory,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', fields: formatValidationErrors(error) },
        { status: 400 },
      );
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return NextResponse.json({ error: 'Resolution already exists for this log' }, { status: 409 });
    }

    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
