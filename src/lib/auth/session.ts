import { UserRole } from '@prisma/client';
import type { NextRequest } from 'next/server';
import type { Session } from 'next-auth';

import { auth } from '@/auth';

import { AuthError } from './errors';

export type AppSession = Session & {
  user: {
    id: string;
    email: string;
    name: string;
    role: UserRole;
  };
};

export async function getRequiredSession(_request?: Request | NextRequest): Promise<AppSession> {
  const session = await auth();

  if (!session?.user?.id || !session.user.email || !session.user.name || !session.user.role) {
    throw new AuthError('AUTH_REQUIRED', 'Authentication required');
  }

  return session as AppSession;
}

export async function getRequiredAdminSession(request?: Request | NextRequest): Promise<AppSession> {
  const session = await getRequiredSession(request);

  if (session.user.role !== UserRole.ADMIN) {
    throw new AuthError('FORBIDDEN', 'Admin role required');
  }

  return session;
}
