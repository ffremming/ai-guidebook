'use client';

import { MyLogsPanel } from '@/components/dashboard/my-logs-panel';
import { StaffDashboardPage } from '@/components/dashboard/staff-dashboard-page';
import { useDashboard } from '@/hooks/useDashboard';
import { UserRole } from '@prisma/client';

type DashboardPageProps = {
  toast?: string;
  userRole: UserRole;
};

export function DashboardPage({ toast, userRole }: DashboardPageProps) {
  const dashboard = useDashboard();

  if (userRole === UserRole.INSTRUCTOR || userRole === UserRole.ADMIN) {
    return <StaffDashboardPage />;
  }

  if (dashboard.isLoading) {
    return <p className="px-2 py-4 text-sm text-slate-700">Loading dashboard...</p>;
  }

  if (dashboard.isError || !dashboard.data) {
    return <p className="px-2 py-4 text-sm text-red-700">Failed to load dashboard.</p>;
  }

  const showLogToast = toast === 'log-created';
  const showResolutionToast = toast === 'resolution-submitted';

  return (
    <main className="space-y-5">
      {showLogToast ? (
        <div
          role="status"
          className="mb-4 rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
        >
          Log submitted successfully.
        </div>
      ) : null}
      {showResolutionToast ? (
        <div
          role="status"
          className="mb-4 rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
        >
          Resolution submitted successfully.
        </div>
      ) : null}

      <header className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Personal Dashboard</h1>
        <p className="mt-1 text-sm text-slate-700">
          Unread policy notifications: {dashboard.data.unreadNotificationCount}
        </p>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold text-slate-900">My Logs</h2>
        <MyLogsPanel />
      </section>
    </main>
  );
}
