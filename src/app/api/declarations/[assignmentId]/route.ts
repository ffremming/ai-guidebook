import { NextResponse } from 'next/server';
import { EnrollmentRole, PolicyStatus, UserRole } from '@prisma/client';
import { ZodError } from 'zod';

import { writeAuditLog } from '@/lib/audit/logger';
import { AuthError } from '@/lib/auth/errors';
import { getRequiredSession } from '@/lib/auth/session';
import { prisma } from '@/lib/db/client';
import { decryptNullableText } from '@/lib/encryption/field-encryptor';
import { patchDeclarationSchema } from '@/lib/validations/declaration.schema';

function clientIp(request: Request): string | undefined {
  const forwarded = request.headers.get('x-forwarded-for');
  if (!forwarded) {
    return undefined;
  }

  return forwarded.split(',')[0]?.trim() || undefined;
}

function formatLogSummaryParagraph(log: {
  id: string;
  aiTool: string;
  usageReason: string | null;
  intentCategory: string | null;
  actualUsageCategory: string | null;
  complianceStatus: string;
  resolutionStatus: string;
  conflictFlag: boolean;
  directViolationFlag: boolean;
  flagSeverity: string | null;
}): string {
  const flags: string[] = [];
  if (log.conflictFlag) {
    flags.push('conflict detected');
  }
  if (log.directViolationFlag) {
    flags.push('direct violation detected');
  }

  const flagText = flags.length > 0 ? flags.join(' and ') : 'no flags raised';
  const severityText = log.flagSeverity ? ` (severity: ${log.flagSeverity})` : '';

  return [
    `Log ${log.id}: Tool used was ${log.aiTool}.`,
    `Reason provided: ${log.usageReason ?? 'N/A'}.`,
    `Intent category: ${log.intentCategory ?? 'Unspecified'}.`,
    `Actual classification: ${log.actualUsageCategory ?? 'Unclassified'}.`,
    `Compliance status: ${log.complianceStatus}.`,
    `Resolution status: ${log.resolutionStatus}.`,
    `Flags: ${flagText}${severityText}.`,
  ].join(' ');
}

async function resolveDeclarationActor(
  sessionUserId: string,
  role: UserRole,
  assignmentId: string,
  requestedUserId?: string,
): Promise<{ actorUserId: string; targetUserId: string; isStaffView: boolean; courseId: string } | null> {
  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    select: { id: true, courseId: true },
  });

  if (!assignment) {
    return null;
  }

  if (role === UserRole.STUDENT) {
    const studentEnrollment = await prisma.enrollment.findFirst({
      where: {
        userId: sessionUserId,
        courseId: assignment.courseId,
        role: EnrollmentRole.STUDENT,
      },
      select: { id: true },
    });

    if (!studentEnrollment) {
      return null;
    }

    return {
      actorUserId: sessionUserId,
      targetUserId: sessionUserId,
      isStaffView: false,
      courseId: assignment.courseId,
    };
  }

  if (role === UserRole.INSTRUCTOR) {
    const instructorEnrollment = await prisma.enrollment.findFirst({
      where: {
        userId: sessionUserId,
        courseId: assignment.courseId,
        role: EnrollmentRole.INSTRUCTOR,
      },
      select: { id: true },
    });

    if (!instructorEnrollment || !requestedUserId) {
      return null;
    }

    const targetEnrollment = await prisma.enrollment.findFirst({
      where: {
        userId: requestedUserId,
        courseId: assignment.courseId,
        role: EnrollmentRole.STUDENT,
      },
      select: { id: true },
    });

    if (!targetEnrollment) {
      return null;
    }

    return {
      actorUserId: sessionUserId,
      targetUserId: requestedUserId,
      isStaffView: true,
      courseId: assignment.courseId,
    };
  }

  if (!requestedUserId) {
    return null;
  }

  return {
    actorUserId: sessionUserId,
    targetUserId: requestedUserId,
    isStaffView: requestedUserId !== sessionUserId,
    courseId: assignment.courseId,
  };
}

async function getOrCreateDeclaration(
  assignmentId: string,
  targetUserId: string,
) {
  const existing = await prisma.declaration.findUnique({
    where: {
      userId_assignmentId: {
        userId: targetUserId,
        assignmentId,
      },
    },
    include: {
      policyVersion: {
        select: {
          id: true,
          versionNumber: true,
          publishedAt: true,
        },
      },
    },
  });

  if (existing) {
    return existing;
  }

  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    select: {
      id: true,
      pinnedPolicyVersionId: true,
    },
  });

  if (!assignment) {
    return null;
  }

  const activePolicy = assignment.pinnedPolicyVersionId
    ? null
    : await prisma.policyVersion.findFirst({
        where: { status: PolicyStatus.ACTIVE },
        select: { id: true },
      });

  const policyVersionId = assignment.pinnedPolicyVersionId ?? activePolicy?.id ?? null;
  if (!policyVersionId) {
    return null;
  }

  const logs = await prisma.aiLog.findMany({
    where: {
      assignmentId,
      userId: targetUserId,
    },
    orderBy: [{ createdAt: 'asc' }],
    select: {
      id: true,
      aiTool: true,
      usageReason: true,
      intentCategory: true,
      actualUsageCategory: true,
      complianceStatus: true,
      resolutionStatus: true,
      conflictFlag: true,
      directViolationFlag: true,
      flagSeverity: true,
    },
  });

  const summaryParagraphs = logs.map((log) =>
    formatLogSummaryParagraph({
      id: log.id,
      aiTool: log.aiTool,
      usageReason: decryptNullableText(log.usageReason),
      intentCategory: log.intentCategory,
      actualUsageCategory: log.actualUsageCategory,
      complianceStatus: log.complianceStatus,
      resolutionStatus: log.resolutionStatus,
      conflictFlag: log.conflictFlag,
      directViolationFlag: log.directViolationFlag,
      flagSeverity: log.flagSeverity,
    }),
  );

  const systemSummary =
    summaryParagraphs.length > 0
      ? summaryParagraphs.join('\n\n')
      : 'No logs were submitted for this assignment.';

  return prisma.declaration.create({
    data: {
      userId: targetUserId,
      assignmentId,
      systemGeneratedSummary: systemSummary,
      policyVersionId,
    },
    include: {
      policyVersion: {
        select: {
          id: true,
          versionNumber: true,
          publishedAt: true,
        },
      },
    },
  });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ assignmentId: string }> },
) {
  try {
    const session = await getRequiredSession(request);
    const { assignmentId } = await context.params;
    const targetUserId =
      new URL(request.url).searchParams.get('userId') ?? undefined;

    const actor = await resolveDeclarationActor(
      session.user.id,
      session.user.role,
      assignmentId,
      targetUserId,
    );

    if (!actor) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const declaration = await getOrCreateDeclaration(assignmentId, actor.targetUserId);
    if (!declaration) {
      return NextResponse.json({ error: 'Assignment or policy not found' }, { status: 404 });
    }

    if (actor.isStaffView) {
      await writeAuditLog({
        actorId: actor.actorUserId,
        actionType: 'STAFF_VIEW',
        resourceType: 'declaration',
        resourceId: declaration.id,
        metadataJson: {
          targetUserId: actor.targetUserId,
          assignmentId,
        },
        ipAddress: clientIp(request),
      });
    }

    return NextResponse.json(
      {
        id: declaration.id,
        assignmentId: declaration.assignmentId,
        userId: declaration.userId,
        systemSummary: declaration.systemGeneratedSummary,
        studentRemarks: declaration.studentRemarks,
        status: declaration.status,
        exportedAt: declaration.exportedAt,
        policyVersion: {
          versionNumber: declaration.policyVersion.versionNumber,
          publishedAt: declaration.policyVersion.publishedAt,
        },
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

export async function PATCH(
  request: Request,
  context: { params: Promise<{ assignmentId: string }> },
) {
  try {
    const session = await getRequiredSession(request);
    const { assignmentId } = await context.params;

    if (session.user.role !== UserRole.STUDENT) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const rawBody = await request.json();
    const immutableFields = ['systemSummary', 'systemGeneratedSummary', 'policyVersionId', 'status'];
    if (rawBody && typeof rawBody === 'object') {
      const invalidFields = immutableFields.filter((key) =>
        Object.prototype.hasOwnProperty.call(rawBody as Record<string, unknown>, key),
      );

      if (invalidFields.length > 0) {
        return NextResponse.json(
          {
            error: 'Immutable declaration fields cannot be updated',
            fields: invalidFields,
          },
          { status: 400 },
        );
      }
    }

    const body = patchDeclarationSchema.parse(rawBody);

    const declaration = await getOrCreateDeclaration(assignmentId, session.user.id);
    if (!declaration) {
      return NextResponse.json({ error: 'Assignment or policy not found' }, { status: 404 });
    }

    const updated = await prisma.declaration.update({
      where: {
        userId_assignmentId: {
          userId: session.user.id,
          assignmentId,
        },
      },
      data: {
        studentRemarks: body.studentRemarks ?? null,
      },
      include: {
        policyVersion: {
          select: {
            versionNumber: true,
            publishedAt: true,
          },
        },
      },
    });

    return NextResponse.json(
      {
        id: updated.id,
        assignmentId: updated.assignmentId,
        userId: updated.userId,
        systemSummary: updated.systemGeneratedSummary,
        studentRemarks: updated.studentRemarks,
        status: updated.status,
        exportedAt: updated.exportedAt,
        policyVersion: {
          versionNumber: updated.policyVersion.versionNumber,
          publishedAt: updated.policyVersion.publishedAt,
        },
      },
      { status: 200 },
    );
  } catch (error) {
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
