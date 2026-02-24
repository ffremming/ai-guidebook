import { NextResponse } from 'next/server';

import { AuthError } from '@/lib/auth/errors';
import { getRequiredSession } from '@/lib/auth/session';
import {
  assignmentUsageTaxonomyVersion,
  getStudentAssignmentUsageTree,
} from '@/lib/db/assignment-usage-tree';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getRequiredSession(request);
    const { id } = await context.params;

    const usageTree = await getStudentAssignmentUsageTree(session.user.id, id);

    if (!usageTree) {
      return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
    }

    return NextResponse.json(
      {
        assignment: usageTree.assignment,
        taxonomyVersion: assignmentUsageTaxonomyVersion,
        tree: usageTree.tree,
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
