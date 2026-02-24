import { NextResponse } from 'next/server';
import { ComplianceStatus, EnrollmentRole, UserRole } from '@prisma/client';
import { ZodError } from 'zod';

import { writeAuditLog } from '@/lib/audit/logger';
import { AuthError } from '@/lib/auth/errors';
import { getRequiredSession } from '@/lib/auth/session';
import { prisma } from '@/lib/db/client';
import {
  findDisallowedUsageSelections,
  findWarningParentSelections,
  getCourseUsageRuleMap,
} from '@/lib/db/course-usage-rules';
import { decryptNullableText, encryptNullableText } from '@/lib/encryption/field-encryptor';
import {
  MANUAL_USAGE_TAXONOMY_VERSION,
  getTopLevelSectionsForSelections,
  getUsageLabelsForSelections,
} from '@/lib/usage-taxonomy';
import { createLogSchema } from '@/lib/validations/log.schema';

function clientIp(request: Request): string | undefined {
  const forwarded = request.headers.get('x-forwarded-for');
  if (!forwarded) {
    return undefined;
  }

  return forwarded.split(',')[0]?.trim() || undefined;
}

async function loadAccessibleLog(logId: string, accessorId: string, role: UserRole) {
  const base = await prisma.aiLog.findUnique({
    where: { id: logId },
    include: {
      conversationLinks: {
        select: {
          id: true,
          usageNodeId: true,
          evidenceType: true,
          url: true,
          comment: true,
          label: true,
          createdAt: true,
        },
        orderBy: [{ createdAt: 'asc' }],
      },
      complianceChecks: {
        orderBy: [{ checkedAt: 'desc' }],
      },
      assignment: {
        select: {
          courseId: true,
          course: {
            select: {
              enrollments: {
                where: {
                  userId: accessorId,
                  role: EnrollmentRole.INSTRUCTOR,
                },
                select: { id: true },
                take: 1,
              },
            },
          },
        },
      },
    },
  });

  if (!base) {
    return null;
  }

  const instructorAllowed = base.assignment.course.enrollments.length > 0;
  const isOwner = base.userId === accessorId;
  const usageLabels = getUsageLabelsForSelections(base.manualUsageSubsections);
  const canAccess =
    role === UserRole.ADMIN ||
    isOwner ||
    (role === UserRole.INSTRUCTOR && instructorAllowed);

  if (!canAccess) {
    return { forbidden: true as const };
  }

  return {
    forbidden: false as const,
    isOwner,
    log: {
      usageLabels,
      id: base.id,
      userId: base.userId,
      assignmentId: base.assignmentId,
      assignmentCourseId: base.assignment.courseId,
      usageSection: base.manualUsageSection,
      usageSubsection: base.manualUsageSubsection,
      usageSubsections: base.manualUsageSubsections,
      usageSections: usageLabels?.sectionIds ?? [],
      usageTaxonomyVersion: base.manualUsageTaxonomyVersion,
      usageReason: decryptNullableText(base.usageReason),
      sessionDescription: decryptNullableText(base.sessionDescription),
      aiTool: base.aiTool,
      loggedAt: base.loggedAt,
      complianceStatus: base.complianceStatus,
      flagSeverity: base.flagSeverity,
      intentCategory: base.intentCategory,
      actualUsageCategory: base.actualUsageCategory,
      conflictFlag: base.conflictFlag,
      directViolationFlag: base.directViolationFlag,
      appliedPolicyVersionId: base.appliedPolicyVersionId,
      resolutionStatus: base.resolutionStatus,
      createdAt: base.createdAt,
      updatedAt: base.updatedAt,
      conversationLinks: base.conversationLinks.map((link) => ({
        id: link.id,
        usageNodeId: link.usageNodeId,
        evidenceType: link.evidenceType,
        url: decryptNullableText(link.url),
        comment: decryptNullableText(link.comment),
        text: decryptNullableText(link.comment) ?? decryptNullableText(link.url),
        label: link.label,
        createdAt: link.createdAt,
      })),
      complianceChecks: base.complianceChecks.map((check) => ({
        ...check,
        inputText: decryptNullableText(check.inputText),
      })),
    },
  };
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getRequiredSession(request);
    const { id } = await context.params;
    const result = await loadAccessibleLog(id, session.user.id, session.user.role);

    if (!result) {
      return NextResponse.json({ error: 'Log not found' }, { status: 404 });
    }

    if (result.forbidden) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!result.isOwner) {
      await writeAuditLog({
        actorId: session.user.id,
        actionType: 'STAFF_VIEW',
        resourceType: 'ai_log',
        resourceId: id,
        metadataJson: {
          accessorId: session.user.id,
          ownerId: result.log.userId,
          fieldsAccessed: ['usageReason', 'sessionDescription', 'conversationLinks', 'complianceChecks'],
        },
        ipAddress: clientIp(request),
      });
    }

    return NextResponse.json(result.log, { status: 200 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getRequiredSession(request);
    const { id } = await context.params;

    const raw = await request.json();
    const parsed = createLogSchema.parse(raw);

    const existing = await prisma.aiLog.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        assignmentId: true,
        manualUsageSection: true,
        manualUsageSubsection: true,
        manualUsageSubsections: true,
        manualUsageTaxonomyVersion: true,
        usageReason: true,
        sessionDescription: true,
        aiTool: true,
        loggedAt: true,
        complianceStatus: true,
        flagSeverity: true,
        intentCategory: true,
        actualUsageCategory: true,
        conflictFlag: true,
        directViolationFlag: true,
        appliedPolicyVersionId: true,
        resolutionStatus: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Log not found' }, { status: 404 });
    }

    if (existing.userId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const assignment = await prisma.assignment.findUnique({
      where: { id: parsed.assignmentId },
      select: {
        id: true,
        courseId: true,
      },
    });

    if (!assignment) {
      return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
    }

    const isAllowed = await prisma.enrollment.findFirst({
      where: {
        userId: session.user.id,
        courseId: assignment.courseId,
        role: EnrollmentRole.STUDENT,
      },
      select: { id: true },
    });

    if (!isAllowed) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (existing.assignmentId !== assignment.id) {
      const conflictingLog = await prisma.aiLog.findFirst({
        where: {
          userId: session.user.id,
          assignmentId: assignment.id,
          id: { not: id },
        },
        select: { id: true },
      });

      if (conflictingLog) {
        return NextResponse.json(
          {
            error: 'A log already exists for this assignment. Please edit the existing log.',
            logId: conflictingLog.id,
          },
          { status: 409 },
        );
      }
    }

    const topSections = getTopLevelSectionsForSelections(parsed.usageSubsections);
    const primarySectionId = topSections[0]?.id ?? null;
    const ruleMap = await getCourseUsageRuleMap(assignment.courseId);
    const hasDisallowedSelections =
      findDisallowedUsageSelections(parsed.usageSubsections, ruleMap).length > 0;
    const hasWarningParentSelections =
      findWarningParentSelections(parsed.usageSubsections, ruleMap).length > 0;
    const nextComplianceStatus = hasDisallowedSelections
      ? ComplianceStatus.NON_COMPLIANT
      : hasWarningParentSelections
        ? ComplianceStatus.WARNING
        : existing.complianceStatus === ComplianceStatus.NON_COMPLIANT ||
            existing.complianceStatus === ComplianceStatus.WARNING
          ? ComplianceStatus.PENDING
          : existing.complianceStatus;

    const updated = await prisma.$transaction(async (tx) => {
      await tx.conversationLink.deleteMany({
        where: {
          aiLogId: id,
        },
      });

      if (parsed.usageEvidence.length > 0) {
        await tx.conversationLink.createMany({
          data: parsed.usageEvidence.map((item) => ({
            aiLogId: id,
            usageNodeId: item.nodeId,
            evidenceType: null,
            url: null,
            comment: encryptNullableText(item.text) ?? null,
            label: null,
          })),
        });
      }

      return tx.aiLog.update({
        where: { id },
        data: {
          assignmentId: parsed.assignmentId,
          manualUsageSection: primarySectionId,
          manualUsageSubsection: parsed.usageSubsections[0] ?? null,
          manualUsageSubsections: parsed.usageSubsections,
          manualUsageTaxonomyVersion: MANUAL_USAGE_TAXONOMY_VERSION,
          usageReason: encryptNullableText(parsed.usageReason) ?? '',
          sessionDescription: encryptNullableText(parsed.sessionDescription || null),
          aiTool: parsed.aiTool,
          complianceStatus: nextComplianceStatus,
        },
        select: {
          id: true,
          userId: true,
          assignmentId: true,
          manualUsageSection: true,
          manualUsageSubsection: true,
          manualUsageSubsections: true,
          manualUsageTaxonomyVersion: true,
          usageReason: true,
          sessionDescription: true,
          aiTool: true,
          loggedAt: true,
          complianceStatus: true,
          flagSeverity: true,
          intentCategory: true,
          actualUsageCategory: true,
          conflictFlag: true,
          directViolationFlag: true,
          appliedPolicyVersionId: true,
          resolutionStatus: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    });
    const updatedUsageLabels = getUsageLabelsForSelections(updated.manualUsageSubsections);

    return NextResponse.json(
      {
        id: updated.id,
        userId: updated.userId,
        assignmentId: updated.assignmentId,
        usageSection: updated.manualUsageSection,
        usageSubsection: updated.manualUsageSubsection,
        usageSubsections: updated.manualUsageSubsections,
        usageSections: updatedUsageLabels?.sectionIds ?? [],
        usageTaxonomyVersion: updated.manualUsageTaxonomyVersion,
        usageReason: decryptNullableText(updated.usageReason),
        sessionDescription: decryptNullableText(updated.sessionDescription),
        aiTool: updated.aiTool,
        loggedAt: updated.loggedAt,
        complianceStatus: updated.complianceStatus,
        flagSeverity: updated.flagSeverity,
        intentCategory: updated.intentCategory,
        actualUsageCategory: updated.actualUsageCategory,
        conflictFlag: updated.conflictFlag,
        directViolationFlag: updated.directViolationFlag,
        appliedPolicyVersionId: updated.appliedPolicyVersionId,
        resolutionStatus: updated.resolutionStatus,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
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
