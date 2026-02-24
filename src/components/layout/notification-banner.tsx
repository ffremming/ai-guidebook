'use client';

import Link from 'next/link';
import { useState } from 'react';

import { useNotifications } from '@/hooks/useNotifications';

export function NotificationBanner() {
  const { unreadCount, unreadNotifications, markRead } = useNotifications();
  const [dismissingIds, setDismissingIds] = useState<Record<string, boolean>>({});

  async function handleDismiss(id: string) {
    setDismissingIds((prev) => ({ ...prev, [id]: true }));

    try {
      await markRead(id);
    } finally {
      setDismissingIds((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  }

  if (unreadCount <= 0) {
    return null;
  }

  return (
    <section className="border-b border-amber-300 bg-amber-50/90 px-4 py-3 sm:px-6">
      <div className="mx-auto w-full max-w-7xl space-y-2">
      {unreadNotifications.map((notification) => (
        <article
          key={notification.id}
          className="rounded-lg border border-amber-300 bg-white p-3 text-sm text-slate-900 shadow-sm"
        >
          <p className="mb-2">{notification.changeSummary}</p>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={`/declarations/${notification.assignmentId}`}
              className="font-medium text-[var(--brand)] underline"
            >
              View declaration
            </Link>
            <button
              type="button"
              onClick={() => handleDismiss(notification.id)}
              disabled={Boolean(dismissingIds[notification.id])}
              className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 disabled:opacity-60"
            >
              {dismissingIds[notification.id] ? 'Dismissing...' : 'Dismiss'}
            </button>
          </div>
        </article>
      ))}
      </div>
    </section>
  );
}
