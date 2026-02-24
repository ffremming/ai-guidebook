import { auth } from '@/auth';
import { authGuard } from '@/lib/auth/guard';

export default auth((request) => authGuard(request));

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
