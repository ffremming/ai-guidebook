'use client';

import Link from 'next/link';

import { useStaffDashboard } from '@/hooks/useStaffDashboard';

export function StaffDashboardPage() {
  const dashboard = useStaffDashboard();

  if (dashboard.isLoading) {
    return <p className="px-2 py-4 text-sm text-slate-700">Loading staff dashboard...</p>;
  }

  if (dashboard.isError || !dashboard.data) {
    return <p className="px-2 py-4 text-sm text-red-700">Failed to load staff dashboard.</p>;
  }

  const { summary, studentPatterns, alerts } = dashboard.data;

  return (
    <main className="space-y-5">
      <header className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Staff Dashboard</h1>
        <p className="mt-1 text-sm text-slate-700">
          Monitor student AI usage patterns and compliance alerts.
        </p>
      </header>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Total Logs</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{summary.totalLogs}</p>
        </article>
        <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Students</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{summary.studentsWithLogs}</p>
        </article>
        <article className="rounded-lg border border-amber-300 bg-amber-50 p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-amber-700">Warnings</p>
          <p className="mt-1 text-2xl font-semibold text-amber-900">{summary.warningLogs}</p>
        </article>
        <article className="rounded-lg border border-red-300 bg-red-50 p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-red-700">Non-Compliant</p>
          <p className="mt-1 text-2xl font-semibold text-red-900">{summary.nonCompliantLogs}</p>
        </article>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Non-Compliance Alerts</h2>
        {alerts.length === 0 ? (
          <p className="text-sm text-slate-700">No active alerts.</p>
        ) : (
          <div className="space-y-2">
            {alerts.map((alert) => (
              <article
                key={alert.logId}
                className={`rounded-md border p-3 ${
                  alert.complianceStatus === 'NON_COMPLIANT'
                    ? 'border-red-300 bg-red-50'
                    : 'border-amber-300 bg-amber-50'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">
                    {alert.studentName} ({alert.studentEmail})
                  </p>
                  <p className="text-xs text-slate-700">
                    {new Date(alert.createdAt).toLocaleString()}
                  </p>
                </div>
                <p className="mt-1 text-sm text-slate-800">
                  {alert.courseCode} • {alert.assignmentTitle}
                </p>
                <p className="mt-1 text-xs text-slate-700">{alert.reasonSnippet}</p>
                <div className="mt-2">
                  <Link href={alert.resolveUrl} className="text-sm font-medium text-[var(--brand)] underline">
                    Review log
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Student Usage Patterns</h2>
        {studentPatterns.length === 0 ? (
          <p className="text-sm text-slate-700">No student activity yet.</p>
        ) : (
          <div className="space-y-2">
            {studentPatterns.map((student) => (
              <article key={student.studentId} className="rounded-md border border-slate-200 bg-[var(--surface-muted)] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">
                    {student.studentName} ({student.studentEmail})
                  </p>
                  <p className="text-xs text-slate-600">
                    Last log: {student.lastLogAt ? new Date(student.lastLogAt).toLocaleString() : 'N/A'}
                  </p>
                </div>
                <p className="mt-1 text-sm text-slate-800">
                  Logs: {student.totalLogs} • Warnings: {student.warningCount} • Non-compliant:{' '}
                  {student.nonCompliantCount}
                </p>
                <p className="mt-1 text-xs text-slate-700">
                  Top tools: {student.topTools.map((item) => `${item.name} (${item.count})`).join(', ') || 'N/A'}
                </p>
                <p className="mt-1 text-xs text-slate-700">
                  Top categories:{' '}
                  {student.topCategories.map((item) => `${item.name} (${item.count})`).join(', ') || 'N/A'}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
