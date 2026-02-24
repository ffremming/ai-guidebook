'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

import { AppShell } from '@/components/layout/app-shell';
import { NotificationBanner } from '@/components/layout/notification-banner';

export function StudentShell({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AppShell
        title="Student Workspace"
        navItems={[
          { href: '/dashboard', label: 'Dashboard' },
          { href: '/subjects', label: 'Subjects' },
          { href: '/assignments', label: 'Assignments' },
          { href: '/log', label: 'New Log' },
        ]}
        topSlot={<NotificationBanner />}
      >
        {children}
      </AppShell>
    </QueryClientProvider>
  );
}
