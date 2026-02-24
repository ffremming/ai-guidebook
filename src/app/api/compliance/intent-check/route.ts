import { NextResponse } from 'next/server';
import { EnrollmentRole, PolicyStatus, UserRole } from '@prisma/client';
import { ZodError } from 'zod';

import { PolicyEvaluator } from '@/lib/compliance';
import { AuthError } from '@/lib/auth/errors';
import { getRequiredSession } from '@/lib/auth/session';
import { prisma } from '@/lib/db/client';
import { intentCheckSchema } from '@/lib/validations/compliance.schema';

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
      return NextResponse.json({ error: 'Student role required' }, { status: 403 });
    }

    const rawBody = await request.json();
    const body = intentCheckSchema.parse(rawBody);

    const assignment = await prisma.assignment.findUnique({
      where: { id: body.assignmentId },
      select: {
        id: true,
        courseId: true,
        pinnedPolicyVersionId: true,
      },
    });

    if (!assignment) {
      return NextResponse.json({ error: 'Invalid assignmentId' }, { status: 400 });
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
      return NextResponse.json({ error: 'Invalid assignmentId' }, { status: 400 });
    }

    const activePolicy = assignment.pinnedPolicyVersionId
      ? null
      : await prisma.policyVersion.findFirst({
          where: { status: PolicyStatus.ACTIVE },
          select: { id: true },
        });

    const policyVersionId = assignment.pinnedPolicyVersionId ?? activePolicy?.id ?? null;

    if (!policyVersionId) {
      return NextResponse.json(
        { error: 'No active policy version available for assignment' },
        { status: 409 },
      );
    }

    const result = await PolicyEvaluator.evaluateIntent(body.reason, policyVersionId);

    return NextResponse.json(
      {
        status: result.complianceStatus,
        detectedCategory: result.detectedCategory,
        ruleReferences: result.ruleReferences,
        message: result.message,
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          fields: formatValidationErrors(error),
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
