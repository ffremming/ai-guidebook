import { NextResponse } from 'next/server';
import { AssignmentStatus, EnrollmentRole, PolicyStatus, Prisma } from '@prisma/client';

import { writeAuditLog } from '@/lib/audit/logger';
import { AuthError } from '@/lib/auth/errors';
import { getRequiredAdminSession } from '@/lib/auth/session';
import { prisma } from '@/lib/db/client';
import { buildPolicyChangeSummary } from '@/lib/policies/service';

function clientIp(request: Request): string | undefined {
  const forwarded = request.headers.get('x-forwarded-for');
  if (!forwarded) {
    return undefined;
  }

  return forwarded.split(',')[0]?.trim() || undefined;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getRequiredAdminSession(request);
    const { id } = await context.params;

    const publishResult = await prisma.$transaction(async (tx) => {
      const targetVersion = await tx.policyVersion.findUnique({
        where: { id },
        include: {
          rules: {
            select: {
              usageCategory: true,
              severityLevel: true,
            },
          },
        },
      });

      if (!targetVersion) {
        return { kind: 'not-found' as const };
      }

      if (targetVersion.status === PolicyStatus.ARCHIVED) {
        return { kind: 'invalid-status' as const };
      }

      const previousActive = await tx.policyVersion.findFirst({
        where: {
          status: PolicyStatus.ACTIVE,
          id: { not: targetVersion.id },
        },
        include: {
          rules: {
            select: {
              usageCategory: true,
              severityLevel: true,
            },
          },
        },
      });

      const now = new Date();

      await tx.policyVersion.update({
        where: { id: targetVersion.id },
        data: {
          status: PolicyStatus.ACTIVE,
          publishedById: session.user.id,
          publishedAt: now,
          archivedAt: null,
        },
      });

      if (!previousActive) {
        return {
          kind: 'published' as const,
          targetVersionId: targetVersion.id,
          notificationsCreated: 0,
          previousActiveId: null as string | null,
        };
      }

      await tx.policyVersion.update({
        where: { id: previousActive.id },
        data: {
          status: PolicyStatus.ARCHIVED,
          archivedAt: now,
        },
      });

      const changeSummary = buildPolicyChangeSummary(
        previousActive.rules,
        targetVersion.rules,
      );

      const assignments = await tx.assignment.findMany({
        where: {
          status: AssignmentStatus.ACTIVE,
          OR: [
            { pinnedPolicyVersionId: previousActive.id },
            { pinnedPolicyVersionId: null },
          ],
        },
        select: {
          id: true,
          course: {
            select: {
              enrollments: {
                where: {
                  role: EnrollmentRole.STUDENT,
                },
                select: {
                  userId: true,
                },
              },
            },
          },
        },
      });

      const notificationData: Prisma.PolicyChangeNotificationCreateManyInput[] = [];
      const seen = new Set<string>();

      for (const assignment of assignments) {
        for (const enrollment of assignment.course.enrollments) {
          const dedupeKey = `${enrollment.userId}:${assignment.id}:${previousActive.id}:${targetVersion.id}`;
          if (seen.has(dedupeKey)) {
            continue;
          }
          seen.add(dedupeKey);

          notificationData.push({
            userId: enrollment.userId,
            assignmentId: assignment.id,
            oldPolicyVersionId: previousActive.id,
            newPolicyVersionId: targetVersion.id,
            changeSummary,
            isRead: false,
          });
        }
      }

      if (notificationData.length > 0) {
        await tx.policyChangeNotification.createMany({
          data: notificationData,
        });
      }

      return {
        kind: 'published' as const,
        targetVersionId: targetVersion.id,
        previousActiveId: previousActive.id,
        notificationsCreated: notificationData.length,
      };
    });

    if (publishResult.kind === 'not-found') {
      return NextResponse.json({ error: 'Policy version not found' }, { status: 404 });
    }

    if (publishResult.kind === 'invalid-status') {
      return NextResponse.json({ error: 'Archived versions cannot be published' }, { status: 400 });
    }

    await writeAuditLog({
      actorId: session.user.id,
      actionType: 'POLICY_VERSION_PUBLISHED',
      resourceType: 'policy_version',
      resourceId: publishResult.targetVersionId,
      metadataJson: {
        previousActiveVersionId: publishResult.previousActiveId,
        notificationsCreated: publishResult.notificationsCreated,
      },
      ipAddress: clientIp(request),
    });

    return NextResponse.json(
      {
        status: PolicyStatus.ACTIVE,
        policyVersionId: publishResult.targetVersionId,
        previousActiveVersionId: publishResult.previousActiveId,
        notificationsCreated: publishResult.notificationsCreated,
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
