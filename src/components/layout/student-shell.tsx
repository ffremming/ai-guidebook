'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

import { AppShell } from '@/components/layout/app-shell';

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
          { href: '/assignments', label: 'Assignments' },
          { href: '/log', label: 'New Log' },
          { href: '/reflections', label: 'Reflections' },
        ]}
      >
        {children}
      </AppShell>
    </QueryClientProvider>
  );
}
