'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

import { AppShell } from '@/components/layout/app-shell';

export function AdminShell({ children }: { children: React.ReactNode }) {
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
        title="Admin Workspace"
        navItems={[{ href: '/policies', label: 'Policies' }]}
      >
        {children}
      </AppShell>
    </QueryClientProvider>
  );
}
