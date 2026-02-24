import { NextResponse } from 'next/server';
import { ComplianceStatus, EnrollmentRole, UserRole } from '@prisma/client';

import { AuthError } from '@/lib/auth/errors';
import { getRequiredSession } from '@/lib/auth/session';
import { prisma } from '@/lib/db/client';
import { decryptNullableText } from '@/lib/encryption/field-encryptor';

type StaffLogRow = {
  id: string;
  createdAt: Date;
  complianceStatus: ComplianceStatus;
  aiTool: string;
  actualUsageCategory: string | null;
  usageReason: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
  assignment: {
    title: string;
    course: {
      courseCode: string;
    };
  };
};

function truncate(input: string, limit = 120): string {
  return input.length > limit ? `${input.slice(0, limit)}...` : input;
}

export async function GET(request: Request) {
  try {
    const session = await getRequiredSession(request);

    if (session.user.role !== UserRole.INSTRUCTOR && session.user.role !== UserRole.ADMIN) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const where =
      session.user.role === UserRole.ADMIN
        ? {}
        : {
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

    const logs = (await prisma.aiLog.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      take: 500,
      select: {
        id: true,
        createdAt: true,
        complianceStatus: true,
        aiTool: true,
        actualUsageCategory: true,
        usageReason: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        assignment: {
          select: {
            title: true,
            course: {
              select: {
                courseCode: true,
              },
            },
          },
        },
      },
    })) as StaffLogRow[];

    const nonCompliantLogs = logs.filter(
      (log) =>
        log.complianceStatus === ComplianceStatus.NON_COMPLIANT ||
        log.complianceStatus === ComplianceStatus.WARNING,
    );

    const byStudent = new Map<
      string,
      {
        studentId: string;
        studentName: string;
        studentEmail: string;
        totalLogs: number;
        nonCompliantCount: number;
        warningCount: number;
        toolCounts: Record<string, number>;
        categoryCounts: Record<string, number>;
        lastLogAt: Date | null;
      }
    >();

    for (const log of logs) {
      const current =
        byStudent.get(log.user.id) ??
        {
          studentId: log.user.id,
          studentName: log.user.name,
          studentEmail: log.user.email,
          totalLogs: 0,
          nonCompliantCount: 0,
          warningCount: 0,
          toolCounts: {},
          categoryCounts: {},
          lastLogAt: null,
        };

      current.totalLogs += 1;
      if (log.complianceStatus === ComplianceStatus.NON_COMPLIANT) {
        current.nonCompliantCount += 1;
      }
      if (log.complianceStatus === ComplianceStatus.WARNING) {
        current.warningCount += 1;
      }

      const toolKey = log.aiTool?.trim() || 'Unknown';
      current.toolCounts[toolKey] = (current.toolCounts[toolKey] ?? 0) + 1;

      const categoryKey = log.actualUsageCategory?.trim() || 'Unclassified';
      current.categoryCounts[categoryKey] = (current.categoryCounts[categoryKey] ?? 0) + 1;

      current.lastLogAt =
        !current.lastLogAt || log.createdAt > current.lastLogAt ? log.createdAt : current.lastLogAt;

      byStudent.set(log.user.id, current);
    }

    const studentPatterns = Array.from(byStudent.values())
      .map((entry) => ({
        studentId: entry.studentId,
        studentName: entry.studentName,
        studentEmail: entry.studentEmail,
        totalLogs: entry.totalLogs,
        nonCompliantCount: entry.nonCompliantCount,
        warningCount: entry.warningCount,
        topTools: Object.entries(entry.toolCounts)
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 3),
        topCategories: Object.entries(entry.categoryCounts)
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 3),
        lastLogAt: entry.lastLogAt,
      }))
      .sort((a, b) => {
        if (b.nonCompliantCount !== a.nonCompliantCount) {
          return b.nonCompliantCount - a.nonCompliantCount;
        }
        return b.totalLogs - a.totalLogs;
      });

    const alerts = nonCompliantLogs.slice(0, 50).map((log) => ({
      logId: log.id,
      studentId: log.user.id,
      studentName: log.user.name,
      studentEmail: log.user.email,
      assignmentTitle: log.assignment.title,
      courseCode: log.assignment.course.courseCode,
      complianceStatus: log.complianceStatus,
      createdAt: log.createdAt,
      reasonSnippet: truncate(decryptNullableText(log.usageReason) ?? ''),
      resolveUrl: `/resolve/${log.id}`,
    }));

    return NextResponse.json(
      {
        summary: {
          totalLogs: logs.length,
          nonCompliantLogs: logs.filter((log) => log.complianceStatus === ComplianceStatus.NON_COMPLIANT).length,
          warningLogs: logs.filter((log) => log.complianceStatus === ComplianceStatus.WARNING).length,
          studentsWithLogs: byStudent.size,
        },
        studentPatterns,
        alerts,
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
