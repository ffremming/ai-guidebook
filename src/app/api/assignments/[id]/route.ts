import { NextResponse } from 'next/server';

import { AuthError } from '@/lib/auth/errors';
import { getRequiredSession } from '@/lib/auth/session';
import { getStudentAssignmentById } from '@/lib/db/assignments';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getRequiredSession(request);
    const { id } = await context.params;

    const data = await getStudentAssignmentById(session.user.id, id);

    if (!data) {
      return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
    }

    if (!data.isEnrolled) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json(
      {
        assignment: data.assignment,
        pinnedPolicyVersion: data.pinnedPolicyVersion,
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
