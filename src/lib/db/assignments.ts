import { EnrollmentRole } from '@prisma/client';

import { prisma } from '@/lib/db/client';

export interface PolicyVersionSummary {
  id: string;
  versionNumber: string;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  publishedAt: Date | null;
}

export interface AssignmentSummary {
  id: string;
  courseId: string;
  title: string;
  assignmentCode: string;
  description: string | null;
  dueDate: Date | null;
  status: 'ACTIVE' | 'CLOSED';
  hasLog?: boolean;
  course: CourseSummary;
}

export interface AssignmentWithPinnedPolicy {
  assignment: AssignmentSummary;
  pinnedPolicyVersion: PolicyVersionSummary | null;
  isEnrolled: boolean;
}

export interface CourseSummary {
  id: string;
  courseCode: string;
  name: string;
  institution: string;
}

export async function listStudentAssignments(
  userId: string,
  courseId?: string,
): Promise<AssignmentSummary[]> {
  const studentEnrollmentCount = await prisma.enrollment.count({
    where: {
      userId,
      role: EnrollmentRole.STUDENT,
    },
  });

  // Demo bootstrap: if a newly-created student has no enrollments yet,
  // attach them to existing courses so subject search is immediately usable.
  if (studentEnrollmentCount === 0) {
    const courses = await prisma.course.findMany({
      select: { id: true },
    });

    if (courses.length > 0) {
      await prisma.enrollment.createMany({
        data: courses.map((course) => ({
          userId,
          courseId: course.id,
          role: EnrollmentRole.STUDENT,
        })),
        skipDuplicates: true,
      });
    }
  }

  const assignments = await prisma.assignment.findMany({
    where: {
      ...(courseId ? { courseId } : {}),
      course: {
        enrollments: {
          some: {
            userId,
            role: EnrollmentRole.STUDENT,
          },
        },
      },
    },
    select: {
      id: true,
      courseId: true,
      title: true,
      assignmentCode: true,
      description: true,
      dueDate: true,
      status: true,
      course: {
        select: {
          id: true,
          courseCode: true,
          name: true,
          institution: true,
        },
      },
    },
    orderBy: [{ dueDate: 'asc' }, { title: 'asc' }],
  });

  const assignmentIds = assignments.map((assignment) => assignment.id);
  const loggedAssignmentIds =
    assignmentIds.length === 0
      ? []
      : await prisma.aiLog.findMany({
          where: {
            userId,
            assignmentId: {
              in: assignmentIds,
            },
          },
          select: {
            assignmentId: true,
          },
          distinct: ['assignmentId'],
        });

  const loggedSet = new Set(loggedAssignmentIds.map((entry) => entry.assignmentId));

  return assignments.map((assignment) => ({
    ...assignment,
    hasLog: loggedSet.has(assignment.id),
  }));
}

export async function getStudentAssignmentById(
  userId: string,
  assignmentId: string,
): Promise<AssignmentWithPinnedPolicy | null> {
  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    select: {
      id: true,
      courseId: true,
      title: true,
      assignmentCode: true,
      description: true,
      dueDate: true,
      status: true,
      pinnedPolicyVersion: {
        select: {
          id: true,
          versionNumber: true,
          status: true,
          publishedAt: true,
        },
      },
      course: {
        select: {
          id: true,
          courseCode: true,
          name: true,
          institution: true,
          enrollments: {
            where: {
              userId,
              role: EnrollmentRole.STUDENT,
            },
            select: { id: true },
            take: 1,
          },
        },
      },
    },
  });

  if (!assignment) {
    return null;
  }

  const isEnrolled = assignment.course.enrollments.length > 0;

  if (!isEnrolled) {
    return {
      assignment: {
        id: assignment.id,
        courseId: assignment.courseId,
        title: assignment.title,
        assignmentCode: assignment.assignmentCode,
        description: assignment.description,
        dueDate: assignment.dueDate,
        status: assignment.status,
        course: {
          id: assignment.course.id,
          courseCode: assignment.course.courseCode,
          name: assignment.course.name,
          institution: assignment.course.institution,
        },
      },
      pinnedPolicyVersion: assignment.pinnedPolicyVersion,
      isEnrolled: false,
    };
  }

  return {
    assignment: {
      id: assignment.id,
      courseId: assignment.courseId,
      title: assignment.title,
      assignmentCode: assignment.assignmentCode,
      description: assignment.description,
      dueDate: assignment.dueDate,
      status: assignment.status,
      course: {
        id: assignment.course.id,
        courseCode: assignment.course.courseCode,
        name: assignment.course.name,
        institution: assignment.course.institution,
      },
    },
    pinnedPolicyVersion: assignment.pinnedPolicyVersion,
    isEnrolled: true,
  };
}

function normalizeAssignmentCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export async function enrollStudentByAssignmentCode(
  userId: string,
  assignmentCode: string,
): Promise<AssignmentSummary | null> {
  const normalizedCode = normalizeAssignmentCode(assignmentCode);

  if (!normalizedCode) {
    return null;
  }

  const assignment = await prisma.assignment.findUnique({
    where: { assignmentCode: normalizedCode },
    select: {
      id: true,
      courseId: true,
      title: true,
      assignmentCode: true,
      description: true,
      dueDate: true,
      status: true,
      course: {
        select: {
          id: true,
          courseCode: true,
          name: true,
          institution: true,
        },
      },
    },
  });

  if (!assignment) {
    return null;
  }

  await prisma.enrollment.createMany({
    data: [
      {
        userId,
        courseId: assignment.courseId,
        role: EnrollmentRole.STUDENT,
      },
    ],
    skipDuplicates: true,
  });

  return assignment;
}
