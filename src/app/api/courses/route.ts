import { NextResponse } from 'next/server';
import { EnrollmentRole } from '@prisma/client';
import { ZodError, z } from 'zod';

import { AuthError } from '@/lib/auth/errors';
import { getRequiredSession } from '@/lib/auth/session';
import { prisma } from '@/lib/db/client';

const enrollCourseSchema = z
  .object({
    courseId: z.string().uuid('courseId must be a valid UUID'),
  })
  .strict();

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

export async function GET(request: Request) {
  try {
    const session = await getRequiredSession(request);
    const { searchParams } = new URL(request.url);
    const rawSearch = searchParams.get('search')?.trim() ?? '';

    if (rawSearch.length < 2) {
      return NextResponse.json({ courses: [] }, { status: 200 });
    }

    const courses = await prisma.course.findMany({
      where: {
        OR: [
          {
            courseCode: {
              contains: rawSearch,
              mode: 'insensitive',
            },
          },
          {
            name: {
              contains: rawSearch,
              mode: 'insensitive',
            },
          },
        ],
      },
      select: {
        id: true,
        courseCode: true,
        name: true,
        institution: true,
        _count: {
          select: {
            assignments: true,
          },
        },
        enrollments: {
          where: {
            userId: session.user.id,
            role: EnrollmentRole.STUDENT,
          },
          select: { id: true },
          take: 1,
        },
      },
      orderBy: [{ courseCode: 'asc' }],
      take: 20,
    });

    return NextResponse.json(
      {
        courses: courses.map((course) => ({
          id: course.id,
          courseCode: course.courseCode,
          name: course.name,
          institution: course.institution,
          assignmentCount: course._count.assignments,
          isEnrolled: course.enrollments.length > 0,
        })),
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

export async function POST(request: Request) {
  try {
    const session = await getRequiredSession(request);
    const rawBody = await request.json();
    const payload = enrollCourseSchema.parse(rawBody);

    const course = await prisma.course.findUnique({
      where: { id: payload.courseId },
      select: {
        id: true,
        courseCode: true,
        name: true,
        institution: true,
      },
    });

    if (!course) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }

    await prisma.enrollment.createMany({
      data: [
        {
          userId: session.user.id,
          courseId: course.id,
          role: EnrollmentRole.STUDENT,
        },
      ],
      skipDuplicates: true,
    });

    return NextResponse.json(
      {
        course,
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: 'Invalid request body', fields: zodFieldErrors(error) },
        { status: 400 },
      );
    }

    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
