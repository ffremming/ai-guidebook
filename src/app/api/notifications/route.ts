import { NextResponse } from 'next/server';
import { UserRole } from '@prisma/client';

import { AuthError } from '@/lib/auth/errors';
import { getRequiredSession } from '@/lib/auth/session';
import { prisma } from '@/lib/db/client';

export async function GET(request: Request) {
  try {
    const session = await getRequiredSession(request);

    if (session.user.role !== UserRole.STUDENT) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const [notifications, unreadCount] = await prisma.$transaction([
      prisma.policyChangeNotification.findMany({
        where: {
          userId: session.user.id,
        },
        orderBy: [{ createdAt: 'desc' }],
      }),
      prisma.policyChangeNotification.count({
        where: {
          userId: session.user.id,
          isRead: false,
        },
      }),
    ]);

    return NextResponse.json(
      {
        notifications,
        unreadCount,
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
