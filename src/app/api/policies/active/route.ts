import { NextResponse } from 'next/server';
import { PolicyStatus } from '@prisma/client';

import { AuthError } from '@/lib/auth/errors';
import { getRequiredSession } from '@/lib/auth/session';
import { prisma } from '@/lib/db/client';

export async function GET(request: Request) {
  try {
    await getRequiredSession(request);

    const version = await prisma.policyVersion.findFirst({
      where: { status: PolicyStatus.ACTIVE },
      select: {
        id: true,
        versionNumber: true,
        description: true,
        status: true,
        publishedAt: true,
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
      return NextResponse.json({ error: 'Active policy version not found' }, { status: 404 });
    }

    return NextResponse.json(version, { status: 200 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
