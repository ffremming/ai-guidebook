import { DashboardPage } from '@/components/dashboard/dashboard-page';

export default async function DashboardRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const toast = params.toast;
  const normalizedToast = Array.isArray(toast) ? toast[0] : toast;

  return <DashboardPage toast={normalizedToast} />;
}
