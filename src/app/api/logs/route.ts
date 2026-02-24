import { NextResponse } from 'next/server';
import { after } from 'next/server';
import { ComplianceStatus, EnrollmentRole, PolicyStatus, UserRole } from '@prisma/client';
import { ZodError } from 'zod';

import { writeAuditLog } from '@/lib/audit/logger';
import { AuthError } from '@/lib/auth/errors';
import { resolveInternalClassifyToken } from '@/lib/auth/internal-token';
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

function zodFieldErrors(error: ZodError) {
  const fields: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const path = issue.path.join('.') || 'root';
    if (!fields[path]) {
      fields[path] = [];
    }
    fields[path].push(issue.message);
  }

  return fields;
}

async function evaluateIntentDefensively(
  usageReason: string,
  policyVersionId: string,
): Promise<{ intentCategory: string | null; complianceStatus: ComplianceStatus }> {
  try {
    const complianceModule = await import('@/lib/compliance');
    const evaluator = complianceModule as unknown as {
      PolicyEvaluator?: {
        evaluateIntent?: (
          reason: string,
          versionId: string,
        ) => Promise<{ detectedCategory?: string | null; complianceStatus?: ComplianceStatus }>;
      };
    };

    if (typeof evaluator.PolicyEvaluator?.evaluateIntent !== 'function') {
      return { intentCategory: null, complianceStatus: ComplianceStatus.PENDING };
    }

    const result = await evaluator.PolicyEvaluator.evaluateIntent(
      usageReason,
      policyVersionId,
    );
    return {
      intentCategory: result.detectedCategory ?? null,
      complianceStatus: result.complianceStatus ?? ComplianceStatus.PENDING,
    };
  } catch {
    return { intentCategory: null, complianceStatus: ComplianceStatus.PENDING };
  }
}

export async function GET(request: Request) {
  try {
    const session = await getRequiredSession(request);
    const { searchParams } = new URL(request.url);
    const requestedUserId = searchParams.get('userId') ?? undefined;

    const where = (() => {
      if (session.user.role === UserRole.STUDENT) {
        return { userId: session.user.id };
      }

      if (session.user.role === UserRole.INSTRUCTOR) {
        return {
          ...(requestedUserId ? { userId: requestedUserId } : {}),
          assignment: {
            course: {
              enrollments: {
                some: {
                  userId: session.user.id,
                  role: EnrollmentRole.INSTRUCTOR,
                },
              },
            },
          },
        };
      }

      return requestedUserId ? { userId: requestedUserId } : {};
    })();

    const logs = await prisma.aiLog.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      include: {
        assignment: {
          select: {
            courseId: true,
            title: true,
            course: {
              select: {
                courseCode: true,
                name: true,
              },
            },
          },
        },
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
      },
    });

    const courseRuleMapCache = new Map<string, Promise<Map<string, boolean>>>();
    const decryptedLogs = await Promise.all(logs.map(async (log) => {
      const usageLabels = getUsageLabelsForSelections(log.manualUsageSubsections);
      const cachedRuleMapPromise = courseRuleMapCache.get(log.assignment.courseId);
      const ruleMapPromise = cachedRuleMapPromise ?? getCourseUsageRuleMap(log.assignment.courseId);
      if (!cachedRuleMapPromise) {
        courseRuleMapCache.set(log.assignment.courseId, ruleMapPromise);
      }
      const ruleMap = await ruleMapPromise;
      const disallowedUsageNodeIds = findDisallowedUsageSelections(
        log.manualUsageSubsections,
        ruleMap,
      );
      const warningUsageNodeIds = findWarningParentSelections(
        log.manualUsageSubsections,
        ruleMap,
      );
      return {
        usageLabels,
        id: log.id,
        userId: log.userId,
        assignmentId: log.assignmentId,
        assignmentTitle: log.assignment.title,
        courseCode: log.assignment.course.courseCode,
        courseName: log.assignment.course.name,
        usageSection: log.manualUsageSection,
        usageSubsection: log.manualUsageSubsection,
        usageSubsections: log.manualUsageSubsections,
        disallowedUsageNodeIds,
        warningUsageNodeIds,
        usageSections: usageLabels?.sectionIds ?? [],
        usageTaxonomyVersion: log.manualUsageTaxonomyVersion,
        usageReason: decryptNullableText(log.usageReason),
        sessionDescription: decryptNullableText(log.sessionDescription),
        aiTool: log.aiTool,
        loggedAt: log.loggedAt,
        complianceStatus: log.complianceStatus,
        flagSeverity: log.flagSeverity,
        intentCategory: log.intentCategory,
        actualUsageCategory: log.actualUsageCategory,
        conflictFlag: log.conflictFlag,
        directViolationFlag: log.directViolationFlag,
        appliedPolicyVersionId: log.appliedPolicyVersionId,
        resolutionStatus: log.resolutionStatus,
        createdAt: log.createdAt,
        updatedAt: log.updatedAt,
        conversationLinks: log.conversationLinks.map((link) => ({
          id: link.id,
          usageNodeId: link.usageNodeId,
          evidenceType: link.evidenceType,
          url: decryptNullableText(link.url),
          comment: decryptNullableText(link.comment),
          text: decryptNullableText(link.comment) ?? decryptNullableText(link.url),
          label: link.label,
          createdAt: link.createdAt,
        })),
      };
    }));

    const normalizedLogs =
      session.user.role === UserRole.STUDENT
        ? Array.from(
            decryptedLogs.reduce((acc, log) => {
              const existing = acc.get(log.assignmentId);
              if (
                !existing ||
                new Date(log.updatedAt).getTime() > new Date(existing.updatedAt).getTime()
              ) {
                acc.set(log.assignmentId, log);
              }
              return acc;
            }, new Map<string, (typeof decryptedLogs)[number]>()),
          )
            .map(([, log]) => log)
            .sort(
              (a, b) =>
                new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
            )
        : decryptedLogs;

    if (session.user.role === UserRole.INSTRUCTOR || session.user.role === UserRole.ADMIN) {
      await writeAuditLog({
        actorId: session.user.id,
        actionType: 'STAFF_VIEW',
        resourceType: 'ai_log_list',
        resourceId: requestedUserId ?? normalizedLogs[0]?.id ?? session.user.id,
        metadataJson: {
          accessorId: session.user.id,
          requestedUserId: requestedUserId ?? null,
          logIds: normalizedLogs.map((log) => log.id),
        },
        ipAddress: clientIp(request),
      });
    }

    return NextResponse.json({ logs: normalizedLogs }, { status: 200 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getRequiredSession(request);
    const rawBody = await request.json();
    const parsed = createLogSchema.parse(rawBody);

    const assignment = await prisma.assignment.findUnique({
      where: { id: parsed.assignmentId },
      select: {
        id: true,
        courseId: true,
        pinnedPolicyVersionId: true,
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

    const existingLog = await prisma.aiLog.findFirst({
      where: {
        userId: session.user.id,
        assignmentId: assignment.id,
      },
      select: { id: true },
    });

    if (existingLog) {
      return NextResponse.json(
        {
          error: 'A log already exists for this assignment. Please edit the existing log.',
          logId: existingLog.id,
        },
        { status: 409 },
      );
    }

    const activePolicy = assignment.pinnedPolicyVersionId
      ? null
      : await prisma.policyVersion.findFirst({
          where: { status: PolicyStatus.ACTIVE },
          select: { id: true },
        });

    const appliedPolicyVersionId = assignment.pinnedPolicyVersionId ?? activePolicy?.id ?? null;

    if (!appliedPolicyVersionId) {
      return NextResponse.json(
        { error: 'No active policy version available for this assignment' },
        { status: 409 },
      );
    }

    const intent = await evaluateIntentDefensively(
      parsed.usageReason,
      appliedPolicyVersionId,
    );
    const ruleMap = await getCourseUsageRuleMap(assignment.courseId);
    const disallowedSelections = findDisallowedUsageSelections(
      parsed.usageSubsections,
      ruleMap,
    );
    const warningParentSelections = findWarningParentSelections(
      parsed.usageSubsections,
      ruleMap,
    );
    const effectiveComplianceStatus =
      disallowedSelections.length > 0
        ? ComplianceStatus.NON_COMPLIANT
        : warningParentSelections.length > 0
          ? ComplianceStatus.WARNING
          : intent.complianceStatus === ComplianceStatus.NON_COMPLIANT
            ? ComplianceStatus.NON_COMPLIANT
            : ComplianceStatus.COMPLIANT;
    const topSections = getTopLevelSectionsForSelections(parsed.usageSubsections);
    const primarySectionId = topSections[0]?.id ?? null;

    const createdLog = await prisma.$transaction(async (tx) => {
      if (!assignment.pinnedPolicyVersionId) {
        await tx.assignment.update({
          where: { id: assignment.id },
          data: {
            pinnedPolicyVersionId: appliedPolicyVersionId,
          },
        });
      }

      const log = await tx.aiLog.create({
        data: {
          userId: session.user.id,
          assignmentId: assignment.id,
          manualUsageSection: primarySectionId,
          manualUsageSubsection: parsed.usageSubsections[0] ?? null,
          manualUsageSubsections: parsed.usageSubsections,
          manualUsageTaxonomyVersion: MANUAL_USAGE_TAXONOMY_VERSION,
          usageReason: encryptNullableText(parsed.usageReason) ?? '',
          sessionDescription: encryptNullableText(parsed.sessionDescription || null),
          aiTool: parsed.aiTool,
          appliedPolicyVersionId,
          intentCategory: intent.intentCategory,
          complianceStatus: effectiveComplianceStatus,
        },
      });

      if (parsed.usageEvidence.length > 0) {
        await tx.conversationLink.createMany({
          data: parsed.usageEvidence.map((item) => ({
            aiLogId: log.id,
            usageNodeId: item.nodeId,
            evidenceType: null,
            url: null,
            comment: encryptNullableText(item.text) ?? null,
            label: null,
          })),
        });
      }

      return log;
    });

    await writeAuditLog({
      actorId: session.user.id,
      actionType: 'LOG_CREATED',
      resourceType: 'ai_log',
      resourceId: createdLog.id,
      metadataJson: {
        assignmentId: createdLog.assignmentId,
        usageSection: createdLog.manualUsageSection,
        usageSubsection: createdLog.manualUsageSubsection,
        usageSubsections: createdLog.manualUsageSubsections,
        usageSections: topSections.map((section) => section.id),
      },
      ipAddress: clientIp(request),
    });

    after(() => {
      const internalToken = resolveInternalClassifyToken();
      void fetch(new URL('/api/compliance/classify', request.url), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(internalToken ? { 'x-internal-token': internalToken } : {}),
        },
        body: JSON.stringify({ logId: createdLog.id }),
      }).catch(() => undefined);
    });

    return NextResponse.json(
      {
        id: createdLog.id,
        usageSection: createdLog.manualUsageSection,
        usageSubsection: createdLog.manualUsageSubsection,
        usageSubsections: createdLog.manualUsageSubsections,
        usageSections: topSections.map((section) => section.id),
        usageTaxonomyVersion: createdLog.manualUsageTaxonomyVersion,
        complianceStatus: createdLog.complianceStatus,
        flagSeverity: createdLog.flagSeverity,
        intentCategory: createdLog.intentCategory,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', fields: zodFieldErrors(error) },
        { status: 400 },
      );
    }

    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
