import { DashboardPage } from '@/components/dashboard/dashboard-page';
import { auth } from '@/auth';
import { UserRole } from '@prisma/client';

export default async function DashboardRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  const params = await searchParams;
  const toast = params.toast;
  const normalizedToast = Array.isArray(toast) ? toast[0] : toast;

  return <DashboardPage toast={normalizedToast} userRole={session?.user?.role ?? UserRole.STUDENT} />;
}
