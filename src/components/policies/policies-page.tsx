'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';

import { PolicyVersionList } from './policy-version-list';

type PolicyVersion = {
  id: string;
  versionNumber: string;
  description: string | null;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  createdAt: string;
};

type PolicyListResponse = {
  versions: PolicyVersion[];
};

async function fetchVersions(): Promise<PolicyListResponse> {
  const response = await fetch('/api/policies', { method: 'GET', cache: 'no-store' });
  if (!response.ok) {
    throw new Error('Failed to load policy versions');
  }
  return (await response.json()) as PolicyListResponse;
}

export function PoliciesPageView() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const versionsQuery = useQuery({
    queryKey: ['policy-versions'],
    queryFn: fetchVersions,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/policies', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          versionNumber: `NTNU-Policy-v${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`,
          description: 'New draft policy version',
          rules: [],
        }),
      });
      if (!response.ok) {
        throw new Error('Failed to create policy version');
      }
      return (await response.json()) as { policyVersionId: string };
    },
    onSuccess: async (payload) => {
      await queryClient.invalidateQueries({ queryKey: ['policy-versions'] });
      router.push(`/policies/${payload.policyVersionId}`);
    },
  });

  if (versionsQuery.isLoading) {
    return <p className="px-2 py-4 text-sm text-slate-700">Loading policy versions...</p>;
  }

  if (versionsQuery.isError || !versionsQuery.data) {
    return <p className="px-2 py-4 text-sm text-red-700">Failed to load policy versions.</p>;
  }

  return (
    <main className="space-y-4">
      <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Policy Versions</h1>
        <button
          type="button"
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {createMutation.isPending ? 'Creating...' : 'Create New Version'}
        </button>
      </div>
      <PolicyVersionList versions={versionsQuery.data.versions} />
    </main>
  );
}
