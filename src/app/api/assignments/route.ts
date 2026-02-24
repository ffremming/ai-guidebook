import { NextResponse } from 'next/server';
import { ZodError, z } from 'zod';

import { AuthError } from '@/lib/auth/errors';
import { getRequiredSession } from '@/lib/auth/session';
import { enrollStudentByAssignmentCode, listStudentAssignments } from '@/lib/db/assignments';

const joinAssignmentSchema = z
  .object({
    assignmentCode: z
      .string()
      .trim()
      .min(1, 'assignmentCode is required')
      .max(32, 'assignmentCode can be at most 32 characters'),
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
    const courseId = searchParams.get('courseId') ?? undefined;

    const assignments = await listStudentAssignments(session.user.id, courseId);

    return NextResponse.json({ assignments }, { status: 200 });
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
    const payload = joinAssignmentSchema.parse(rawBody);

    const assignment = await enrollStudentByAssignmentCode(
      session.user.id,
      payload.assignmentCode,
    );

    if (!assignment) {
      return NextResponse.json({ error: 'Invalid assignment code' }, { status: 400 });
    }

    return NextResponse.json({ assignment }, { status: 200 });
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
