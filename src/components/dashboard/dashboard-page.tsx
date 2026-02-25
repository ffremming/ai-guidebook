'use client';

import { MyLogsPanel } from '@/components/dashboard/my-logs-panel';

type DashboardPageProps = {
  toast?: string;
};

export function DashboardPage({ toast }: DashboardPageProps) {
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
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold text-slate-900">My Logs</h2>
        <MyLogsPanel />
      </section>
    </main>
  );
}
