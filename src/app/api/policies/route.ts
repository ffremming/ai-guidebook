import { NextResponse } from 'next/server';
import { PolicyStatus, Prisma, UserRole } from '@prisma/client';

import { writeAuditLog } from '@/lib/audit/logger';
import { AuthError } from '@/lib/auth/errors';
import { getRequiredAdminSession, getRequiredSession } from '@/lib/auth/session';
import { prisma } from '@/lib/db/client';
import {
  createDraftPolicyVersion,
  parseCreatePolicyBody,
} from '@/lib/policies/service';

function clientIp(request: Request): string | undefined {
  const forwarded = request.headers.get('x-forwarded-for');
  if (!forwarded) {
    return undefined;
  }

  return forwarded.split(',')[0]?.trim() || undefined;
}

export async function GET(request: Request) {
  try {
    const session = await getRequiredSession(request);

    const statusFilter: PolicyStatus[] =
      session.user.role === UserRole.ADMIN
        ? [PolicyStatus.DRAFT, PolicyStatus.ACTIVE, PolicyStatus.ARCHIVED]
        : [PolicyStatus.ACTIVE, PolicyStatus.ARCHIVED];

    const versions = await prisma.policyVersion.findMany({
      where: {
        status: { in: statusFilter },
      },
      select: {
        id: true,
        versionNumber: true,
        description: true,
        status: true,
        publishedAt: true,
        archivedAt: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: 'desc' }],
    });

    return NextResponse.json({ versions }, { status: 200 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getRequiredAdminSession(request);
    const body = await request.json();
    const parsed = parseCreatePolicyBody(body);

    if (!parsed) {
      return NextResponse.json({ error: 'Invalid policy payload' }, { status: 400 });
    }

    const created = await createDraftPolicyVersion(parsed);

    await writeAuditLog({
      actorId: session.user.id,
      actionType: 'POLICY_VERSION_CREATED',
      resourceType: 'policy_version',
      resourceId: created.id,
      metadataJson: {
        versionNumber: parsed.versionNumber,
        ruleCount: parsed.rules.length,
      },
      ipAddress: clientIp(request),
    });

    return NextResponse.json(
      { policyVersionId: created.id, status: created.status },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return NextResponse.json({ error: 'versionNumber must be unique' }, { status: 409 });
    }

    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
