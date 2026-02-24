import { NextResponse } from 'next/server';
import { EnrollmentRole, UserRole } from '@prisma/client';

import { writeAuditLog } from '@/lib/audit/logger';
import { AuthError } from '@/lib/auth/errors';
import { getRequiredSession } from '@/lib/auth/session';
import { prisma } from '@/lib/db/client';

function clientIp(request: Request): string | undefined {
  const forwarded = request.headers.get('x-forwarded-for');
  if (!forwarded) {
    return undefined;
  }

  return forwarded.split(',')[0]?.trim() || undefined;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ logId: string }> },
) {
  try {
    const session = await getRequiredSession(request);
    const { logId } = await context.params;

    const data = await prisma.aiLog.findUnique({
      where: { id: logId },
      select: {
        id: true,
        userId: true,
        conflictFlag: true,
        directViolationFlag: true,
        flagSeverity: true,
        actualUsageCategory: true,
        assignment: {
          select: {
            course: {
              select: {
                enrollments: {
                  where: {
                    userId: session.user.id,
                    role: EnrollmentRole.INSTRUCTOR,
                  },
                  select: { id: true },
                  take: 1,
                },
              },
            },
          },
        },
        resolution: {
          select: {
            id: true,
            aiLogId: true,
            userId: true,
            narrativeExplanation: true,
            disputedCategory: true,
            disputeEvidence: true,
            originalSystemCategory: true,
            submittedAt: true,
            createdAt: true,
          },
        },
      },
    });

    if (!data) {
      return NextResponse.json({ error: 'Log not found' }, { status: 404 });
    }

    const instructorAllowed = data.assignment.course.enrollments.length > 0;
    const isOwner = data.userId === session.user.id;
    const canAccess =
      session.user.role === UserRole.ADMIN ||
      isOwner ||
      (session.user.role === UserRole.INSTRUCTOR && instructorAllowed);

    if (!canAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!isOwner) {
      await writeAuditLog({
        actorId: session.user.id,
        actionType: 'STAFF_VIEW',
        resourceType: 'resolution',
        resourceId: logId,
        metadataJson: {
          ownerId: data.userId,
          logId,
        },
        ipAddress: clientIp(request),
      });
    }

    return NextResponse.json(
      {
        resolution: data.resolution,
        originalFlag: {
          conflictFlag: data.conflictFlag,
          directViolationFlag: data.directViolationFlag,
          flagSeverity: data.flagSeverity,
        },
        originalSystemCategory: data.actualUsageCategory,
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
