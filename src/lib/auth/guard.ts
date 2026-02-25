import { UserRole } from '@prisma/client';
import { NextResponse, type NextRequest } from 'next/server';
import type { Session } from 'next-auth';

type RequestWithAuth = NextRequest & { auth?: Session | null };

const PUBLIC_PATHS = ['/login', '/callback'];
const STATIC_PREFIXES = ['/api/auth', '/api/compliance/classify', '/_next', '/favicon.ico'];

function isPublicPath(pathname: string) {
  return (
    PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`)) ||
    STATIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  );
}

function forbiddenResponse(pathname: string) {
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return new NextResponse('Forbidden', { status: 403 });
}

function unauthenticatedResponse(pathname: string, requestUrl: string) {
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  return NextResponse.redirect(new URL('/login', requestUrl));
}

export function authGuard(request: RequestWithAuth) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const session = request.auth;

  if (!session?.user?.id) {
    return unauthenticatedResponse(pathname, request.url);
  }

  if (session.user.role !== UserRole.ADMIN && pathname.startsWith('/admin')) {
    return forbiddenResponse(pathname);
  }

  return NextResponse.next();
}

export const authMatcher = ['/((?!_next/static|_next/image|favicon.ico).*)'];
