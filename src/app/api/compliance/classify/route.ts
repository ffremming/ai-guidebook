import { NextResponse } from 'next/server';
import {
  CheckType,
  ComplianceStatus,
  ResolutionStatus,
  SeverityLevel,
} from '@prisma/client';
import { ZodError } from 'zod';

import { resolveInternalClassifyToken } from '@/lib/auth/internal-token';
import { PolicyEvaluator } from '@/lib/compliance';
import {
  findDisallowedUsageSelections,
  findWarningParentSelections,
  getCourseUsageRuleMap,
} from '@/lib/db/course-usage-rules';
import { prisma } from '@/lib/db/client';
import { decryptNullableText } from '@/lib/encryption/field-encryptor';
import { encryptText } from '@/lib/encryption/aes';
import { classifySchema } from '@/lib/validations/compliance.schema';

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
  const expectedToken = resolveInternalClassifyToken();
  const providedToken = request.headers.get('x-internal-token');

  if (!expectedToken || providedToken !== expectedToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = classifySchema.parse(await request.json());

    const log = await prisma.aiLog.findUnique({
      where: { id: body.logId },
      select: {
        id: true,
        userId: true,
        assignment: {
          select: {
            courseId: true,
          },
        },
        manualUsageSubsections: true,
        usageReason: true,
        sessionDescription: true,
        intentCategory: true,
        appliedPolicyVersionId: true,
        complianceStatus: true,
      },
    });

    if (!log) {
      return NextResponse.json({ error: 'Log not found' }, { status: 404 });
    }

    if (log.complianceStatus !== ComplianceStatus.PENDING) {
      return NextResponse.json({ error: 'Log already classified' }, { status: 409 });
    }

    const usageReason = decryptNullableText(log.usageReason) ?? '';
    const sessionDescription = decryptNullableText(log.sessionDescription) ?? '';
    const combinedText = `${usageReason}\n${sessionDescription}`.trim();

    const result = await PolicyEvaluator.evaluatePostSession({
      logId: log.id,
      sessionText: combinedText,
      policyVersionId: log.appliedPolicyVersionId,
      intentCategory: log.intentCategory ?? null,
    });

    const courseRuleMap = await getCourseUsageRuleMap(log.assignment.courseId);
    const disallowedSelections = findDisallowedUsageSelections(
      log.manualUsageSubsections,
      courseRuleMap,
    );
    const warningParentSelections = findWarningParentSelections(
      log.manualUsageSubsections,
      courseRuleMap,
    );
    const hasTreeViolation = disallowedSelections.length > 0;
    const hasTreeWarning = warningParentSelections.length > 0;
    const mergedRuleReferences = Array.from(
      new Set([
        ...result.ruleReferences,
        ...disallowedSelections.map((nodeId) => `COURSE_USAGE_RULE:${nodeId}`),
        ...warningParentSelections.map((nodeId) => `COURSE_USAGE_WARNING:${nodeId}`),
      ]),
    );
    const effectiveDirectViolation = result.directViolationFlag || hasTreeViolation;
    const effectiveComplianceStatus =
      hasTreeViolation || result.conflictFlag || result.directViolationFlag
        ? ComplianceStatus.NON_COMPLIANT
        : hasTreeWarning
          ? ComplianceStatus.WARNING
          : ComplianceStatus.COMPLIANT;
    const effectiveFlagSeverity =
      hasTreeViolation && result.flagSeverity !== SeverityLevel.FORBIDDEN
        ? SeverityLevel.FORBIDDEN
        : result.flagSeverity;
    const shouldRequireResolution = result.conflictFlag || effectiveDirectViolation;

    await prisma.$transaction(async (tx) => {
      await tx.aiLog.update({
        where: { id: log.id },
        data: {
          actualUsageCategory: result.actualCategory,
          conflictFlag: result.conflictFlag,
          directViolationFlag: effectiveDirectViolation,
          flagSeverity: effectiveFlagSeverity,
          complianceStatus: effectiveComplianceStatus,
          resolutionStatus: shouldRequireResolution
            ? ResolutionStatus.UNRESOLVED
            : ResolutionStatus.NONE,
        },
      });

      await tx.complianceCheck.create({
        data: {
          aiLogId: log.id,
          checkType: CheckType.POST_SESSION,
          policyVersionId: log.appliedPolicyVersionId,
          inputText: encryptText(combinedText),
          detectedCategory: result.actualCategory ?? 'UNKNOWN',
          complianceResult: effectiveComplianceStatus,
          ruleReferences: mergedRuleReferences,
          flagsJson: {
            conflictFlag: result.conflictFlag,
            directViolationFlag: effectiveDirectViolation,
            flagSeverity: effectiveFlagSeverity,
            treeViolation: hasTreeViolation,
            disallowedUsageNodes: disallowedSelections,
            treeWarning: hasTreeWarning,
            warningParentNodes: warningParentSelections,
          },
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: log.userId,
          actionType: 'COMPLIANCE_CLASSIFIED',
          resourceType: 'ai_log',
          resourceId: log.id,
          metadataJson: {
            complianceStatus: effectiveComplianceStatus,
            conflictFlag: result.conflictFlag,
            directViolationFlag: effectiveDirectViolation,
            ruleReferences: mergedRuleReferences,
            treeViolation: hasTreeViolation,
            disallowedUsageNodes: disallowedSelections,
            treeWarning: hasTreeWarning,
            warningParentNodes: warningParentSelections,
          },
          ipAddress: clientIp(request),
        },
      });
    });

    return NextResponse.json(
      {
        logId: log.id,
        actualCategory: result.actualCategory,
        conflictFlag: result.conflictFlag,
        directViolationFlag: effectiveDirectViolation,
        flagSeverity: effectiveFlagSeverity,
        complianceStatus: effectiveComplianceStatus,
        resolutionStatus: shouldRequireResolution
          ? ResolutionStatus.UNRESOLVED
          : ResolutionStatus.NONE,
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', fields: formatValidationErrors(error) },
        { status: 400 },
      );
    }

    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
