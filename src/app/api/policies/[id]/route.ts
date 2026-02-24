import { NextResponse } from 'next/server';
import { AssignmentStatus, EnrollmentRole, PolicyStatus, SeverityLevel, UserRole } from '@prisma/client';

import { AuthError } from '@/lib/auth/errors';
import { getRequiredSession } from '@/lib/auth/session';
import { prisma } from '@/lib/db/client';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getRequiredSession(request);
    const { id } = await context.params;

    const version = await prisma.policyVersion.findUnique({
      where: { id },
      select: {
        id: true,
        versionNumber: true,
        description: true,
        status: true,
        publishedAt: true,
        archivedAt: true,
        createdAt: true,
        rules: {
          select: {
            id: true,
            usageCategory: true,
            severityLevel: true,
            description: true,
            ruleReference: true,
            keywords: true,
          },
          orderBy: [{ usageCategory: 'asc' }],
        },
      },
    });

    if (!version) {
      return NextResponse.json({ error: 'Policy version not found' }, { status: 404 });
    }

    const canViewDraft =
      session.user.role === UserRole.ADMIN || version.status !== PolicyStatus.DRAFT;

    if (!canViewDraft) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    let affectedStudentsCount = 0;

    if (session.user.role === UserRole.ADMIN) {
      const previousActive = await prisma.policyVersion.findFirst({
        where: {
          status: PolicyStatus.ACTIVE,
          id: { not: version.id },
        },
        select: { id: true },
      });

      if (version.status === PolicyStatus.DRAFT && previousActive) {
        const assignments = await prisma.assignment.findMany({
          where: {
            status: AssignmentStatus.ACTIVE,
            OR: [{ pinnedPolicyVersionId: previousActive.id }, { pinnedPolicyVersionId: null }],
          },
          select: {
            id: true,
            course: {
              select: {
                enrollments: {
                  where: { role: EnrollmentRole.STUDENT },
                  select: { userId: true },
                },
              },
            },
          },
        });

        const impacted = new Set<string>();
        for (const assignment of assignments) {
          for (const enrollment of assignment.course.enrollments) {
            impacted.add(enrollment.userId);
          }
        }
        affectedStudentsCount = impacted.size;
      }
    }

    return NextResponse.json({ ...version, affectedStudentsCount }, { status: 200 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

function normalizeKeywords(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function isSeverityLevel(input: unknown): input is SeverityLevel {
  return (
    input === SeverityLevel.ALLOWED ||
    input === SeverityLevel.MINOR ||
    input === SeverityLevel.MODERATE ||
    input === SeverityLevel.SERIOUS ||
    input === SeverityLevel.FORBIDDEN
  );
}

function parsePolicyRulesUpdate(body: unknown):
  | { description?: string | null; rules: Array<{ usageCategory: string; severityLevel: SeverityLevel; ruleReference: string; description?: string | null; keywords: string[] }> }
  | null {
  if (!body || typeof body !== 'object') {
    return null;
  }

  const raw = body as Record<string, unknown>;
  const rawRules = Array.isArray(raw.rules) ? raw.rules : null;
  if (!rawRules) {
    return null;
  }

  const description =
    typeof raw.description === 'string' ? raw.description.trim() : null;

  const seenCategories = new Set<string>();
  const rules: Array<{
    usageCategory: string;
    severityLevel: SeverityLevel;
    ruleReference: string;
    description?: string | null;
    keywords: string[];
  }> = [];

  for (const rawRule of rawRules) {
    if (!rawRule || typeof rawRule !== 'object') {
      return null;
    }

    const rule = rawRule as Record<string, unknown>;
    const usageCategory =
      typeof rule.usageCategory === 'string' ? rule.usageCategory.trim() : '';
    const severityLevel = rule.severityLevel;
    const ruleReference =
      typeof rule.ruleReference === 'string' ? rule.ruleReference.trim() : '';
    const ruleDescription =
      typeof rule.description === 'string' ? rule.description.trim() : null;

    if (!usageCategory || !isSeverityLevel(severityLevel) || !ruleReference) {
      return null;
    }

    const normalizedCategory = usageCategory.toLowerCase();
    if (seenCategories.has(normalizedCategory)) {
      return null;
    }
    seenCategories.add(normalizedCategory);

    rules.push({
      usageCategory,
      severityLevel,
      ruleReference,
      description: ruleDescription,
      keywords: normalizeKeywords(rule.keywords),
    });
  }

  return {
    description,
    rules,
  };
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getRequiredSession(request);
    if (session.user.role !== UserRole.ADMIN) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await context.params;
    const parsed = parsePolicyRulesUpdate(await request.json());
    if (!parsed) {
      return NextResponse.json({ error: 'Invalid policy payload' }, { status: 400 });
    }

    const existing = await prisma.policyVersion.findUnique({
      where: { id },
      select: { id: true, status: true },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Policy version not found' }, { status: 404 });
    }

    if (existing.status !== PolicyStatus.DRAFT) {
      return NextResponse.json({ error: 'Only draft versions are editable' }, { status: 400 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.policyRule.deleteMany({
        where: { policyVersionId: id },
      });

      if (parsed.rules.length > 0) {
        await tx.policyRule.createMany({
          data: parsed.rules.map((rule) => ({
            policyVersionId: id,
            usageCategory: rule.usageCategory,
            severityLevel: rule.severityLevel,
            ruleReference: rule.ruleReference,
            description: rule.description,
            keywords: rule.keywords,
          })),
        });
      }

      return tx.policyVersion.update({
        where: { id },
        data: { description: parsed.description },
        select: {
          id: true,
          versionNumber: true,
          status: true,
          description: true,
          rules: {
            select: {
              id: true,
              usageCategory: true,
              severityLevel: true,
              description: true,
              ruleReference: true,
              keywords: true,
            },
            orderBy: [{ usageCategory: 'asc' }],
          },
        },
      });
    });

    return NextResponse.json(updated, { status: 200 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
