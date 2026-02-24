import { redirect } from 'next/navigation';
import { UserRole } from '@prisma/client';

import { auth } from '@/auth';

export default async function Home() {
  const session = await auth();

  if (session?.user?.role === UserRole.ADMIN) {
    redirect('/policies');
  }

  redirect('/dashboard');
}
