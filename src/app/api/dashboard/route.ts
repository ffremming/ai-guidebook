import { NextResponse } from 'next/server';
import { EnrollmentRole, ResolutionStatus, UserRole } from '@prisma/client';

import { AuthError } from '@/lib/auth/errors';
import { getRequiredSession } from '@/lib/auth/session';
import { prisma } from '@/lib/db/client';
import { decryptNullableText } from '@/lib/encryption/field-encryptor';

function truncateTo100(input: string | null): string {
  if (!input) {
    return '';
  }

  return input.length <= 100 ? input : input.slice(0, 100);
}

export async function GET(request: Request) {
  try {
    const session = await getRequiredSession(request);

    if (session.user.role !== UserRole.STUDENT) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const [assignments, unresolvedCounts, actionLogs, recentLogs, unreadNotificationCount] =
        await Promise.all([
          tx.assignment.findMany({
            where: {
              course: {
                enrollments: {
                  some: {
                    userId: session.user.id,
                    role: EnrollmentRole.STUDENT,
                  },
                },
              },
            },
            select: {
              id: true,
              title: true,
            },
            orderBy: [{ createdAt: 'asc' }],
          }),
          tx.aiLog.groupBy({
            by: ['assignmentId'],
            where: {
              userId: session.user.id,
              resolutionStatus: ResolutionStatus.UNRESOLVED,
            },
            _count: {
              _all: true,
            },
          }),
          tx.aiLog.findMany({
            where: {
              userId: session.user.id,
              resolutionStatus: ResolutionStatus.UNRESOLVED,
            },
            select: {
              id: true,
              flagSeverity: true,
              assignment: {
                select: {
                  title: true,
                },
              },
            },
            orderBy: [{ createdAt: 'desc' }],
          }),
          tx.aiLog.findMany({
            where: {
              userId: session.user.id,
            },
            take: 20,
            orderBy: [{ createdAt: 'desc' }],
            select: {
              id: true,
              usageReason: true,
              intentCategory: true,
              actualUsageCategory: true,
              complianceStatus: true,
              resolutionStatus: true,
              createdAt: true,
            },
          }),
          tx.policyChangeNotification.count({
            where: {
              userId: session.user.id,
              isRead: false,
            },
          }),
        ]);

      return {
        assignments,
        unresolvedCounts,
        actionLogs,
        recentLogs,
        unreadNotificationCount,
      };
    });

    const unresolvedByAssignment = new Map<string, number>(
      result.unresolvedCounts.map((entry) => [entry.assignmentId, entry._count._all]),
    );

    const assignmentStatuses = result.assignments.map((assignment) => {
      const pendingCount = unresolvedByAssignment.get(assignment.id) ?? 0;
      return {
        assignmentId: assignment.id,
        assignmentTitle: assignment.title,
        status: pendingCount > 0 ? 'PENDING' : 'READY',
        pendingCount,
      };
    });

    const actionItems = result.actionLogs.map((log) => ({
      logId: log.id,
      assignmentTitle: log.assignment.title,
      flagSeverity: log.flagSeverity,
      resolveUrl: `/resolve/${log.id}`,
    }));

    const recentLogs = result.recentLogs.map((log) => ({
      id: log.id,
      usageReason: truncateTo100(decryptNullableText(log.usageReason)),
      userStatedIntent: log.intentCategory,
      systemClassification: log.actualUsageCategory,
      complianceStatus: log.complianceStatus,
      resolutionStatus: log.resolutionStatus,
      createdAt: log.createdAt,
    }));

    return NextResponse.json(
      {
        actionItems,
        assignmentStatuses,
        recentLogs,
        unreadNotificationCount: result.unreadNotificationCount,
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
