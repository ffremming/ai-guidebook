import { NextResponse } from 'next/server';
import { DeclarationStatus, EnrollmentRole, PolicyStatus, UserRole } from '@prisma/client';

import { writeAuditLog } from '@/lib/audit/logger';
import { AuthError } from '@/lib/auth/errors';
import { getRequiredSession } from '@/lib/auth/session';
import { prisma } from '@/lib/db/client';
import { decryptNullableText } from '@/lib/encryption/field-encryptor';

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

export async function POST(
  request: Request,
  context: { params: Promise<{ assignmentId: string }> },
) {
  try {
    const session = await getRequiredSession(request);
    const { assignmentId } = await context.params;

    if (session.user.role !== UserRole.STUDENT) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const assignment = await prisma.assignment.findUnique({
      where: { id: assignmentId },
      select: {
        id: true,
        pinnedPolicyVersionId: true,
        courseId: true,
      },
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

    const activePolicy = assignment.pinnedPolicyVersionId
      ? null
      : await prisma.policyVersion.findFirst({
          where: { status: PolicyStatus.ACTIVE },
          select: { id: true },
        });
    const policyVersionId = assignment.pinnedPolicyVersionId ?? activePolicy?.id ?? null;

    if (!policyVersionId) {
      return NextResponse.json({ error: 'No policy version available' }, { status: 409 });
    }

    const logs = await prisma.aiLog.findMany({
      where: {
        userId: session.user.id,
        assignmentId,
      },
      include: {
        resolution: true,
        conversationLinks: {
          orderBy: [{ createdAt: 'asc' }],
        },
      },
      orderBy: [{ createdAt: 'asc' }],
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
    const generatedSummary =
      summaryParagraphs.length > 0
        ? summaryParagraphs.join('\n\n')
        : 'No logs were submitted for this assignment.';

    const declaration = await prisma.declaration.upsert({
      where: {
        userId_assignmentId: {
          userId: session.user.id,
          assignmentId,
        },
      },
      update: {},
      create: {
        userId: session.user.id,
        assignmentId,
        policyVersionId,
        systemGeneratedSummary: generatedSummary,
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

    const updatedDeclaration = await prisma.declaration.update({
      where: { id: declaration.id },
      data: {
        status: DeclarationStatus.EXPORTED,
        exportedAt: new Date(),
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

    await writeAuditLog({
      actorId: session.user.id,
      actionType: 'DECLARATION_EXPORTED',
      resourceType: 'declaration',
      resourceId: declaration.id,
      metadataJson: {
        assignmentId,
        logCount: logs.length,
      },
      ipAddress: clientIp(request),
    });

    const flags = logs
      .filter((log) => log.conflictFlag || log.directViolationFlag)
      .map((log) => ({
        logId: log.id,
        conflictFlag: log.conflictFlag,
        directViolationFlag: log.directViolationFlag,
        flagSeverity: log.flagSeverity,
        complianceStatus: log.complianceStatus,
      }));

    const resolutions = logs
      .map((log) => log.resolution)
      .filter((resolution): resolution is NonNullable<typeof resolution> => Boolean(resolution))
      .map((resolution) => ({
        id: resolution.id,
        logId: resolution.aiLogId,
        narrativeExplanation: resolution.narrativeExplanation,
        disputedCategory: resolution.disputedCategory,
        disputeEvidence: resolution.disputeEvidence,
        originalSystemCategory: resolution.originalSystemCategory,
        submittedAt: resolution.submittedAt,
      }));

    return NextResponse.json(
      {
        systemSummary: updatedDeclaration.systemGeneratedSummary,
        studentRemarks: updatedDeclaration.studentRemarks,
        policyVersionNumber: updatedDeclaration.policyVersion.versionNumber,
        logs: logs.map((log) => ({
          id: log.id,
          aiTool: log.aiTool,
          usageSection: log.manualUsageSection,
          usageSubsection: log.manualUsageSubsection,
          usageSubsections: log.manualUsageSubsections,
          usageTaxonomyVersion: log.manualUsageTaxonomyVersion,
          usageReason: decryptNullableText(log.usageReason),
          sessionDescription: decryptNullableText(log.sessionDescription),
          intentCategory: log.intentCategory,
          actualUsageCategory: log.actualUsageCategory,
          complianceStatus: log.complianceStatus,
          resolutionStatus: log.resolutionStatus,
          createdAt: log.createdAt,
          conversationLinks: log.conversationLinks.map((link) => ({
            id: link.id,
            usageNodeId: link.usageNodeId,
            evidenceType: link.evidenceType,
            url: decryptNullableText(link.url),
            comment: decryptNullableText(link.comment),
            text: decryptNullableText(link.comment) ?? decryptNullableText(link.url),
            label: link.label,
          })),
        })),
        flags,
        resolutions,
        exportedAt: updatedDeclaration.exportedAt,
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
