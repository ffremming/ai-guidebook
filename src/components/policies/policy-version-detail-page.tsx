'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { PolicyVersionList } from './policy-version-list';
import { PolicyRuleEditor, type EditablePolicyRule } from './policy-rule-editor';
import { PublishPolicyModal } from './publish-policy-modal';

type PolicyVersionDetail = {
  id: string;
  versionNumber: string;
  description: string | null;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  createdAt: string;
  affectedStudentsCount: number;
  rules: Array<{
    id: string;
    usageCategory: string;
    severityLevel: 'ALLOWED' | 'MINOR' | 'MODERATE' | 'SERIOUS' | 'FORBIDDEN';
    description: string | null;
    ruleReference: string;
    keywords: string[];
  }>;
};

type PolicyListResponse = {
  versions: Array<{
    id: string;
    versionNumber: string;
    description: string | null;
    status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
    createdAt: string;
  }>;
};

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

type PolicyVersionDetailPageProps = {
  versionId: string;
};

export function PolicyVersionDetailPage({ versionId }: PolicyVersionDetailPageProps) {
  const queryClient = useQueryClient();
  const versionQuery = useQuery({
    queryKey: ['policy-version', versionId],
    queryFn: () => fetchJson<PolicyVersionDetail>(`/api/policies/${versionId}`),
  });

  const versionsQuery = useQuery({
    queryKey: ['policy-versions'],
    queryFn: () => fetchJson<PolicyListResponse>('/api/policies'),
  });

  const saveMutation = useMutation({
    mutationFn: (payload: { description: string | null; rules: EditablePolicyRule[] }) =>
      fetchJson<PolicyVersionDetail>(`/api/policies/${versionId}`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['policy-version', versionId] });
      await queryClient.invalidateQueries({ queryKey: ['policy-versions'] });
    },
  });

  const publishMutation = useMutation({
    mutationFn: () =>
      fetchJson<{ status: 'ACTIVE' }>(`/api/policies/${versionId}/publish`, {
        method: 'POST',
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['policy-version', versionId] });
      await queryClient.invalidateQueries({ queryKey: ['policy-versions'] });
    },
  });

  if (versionQuery.isLoading) {
    return <p className="px-2 py-4 text-sm text-slate-700">Loading policy version...</p>;
  }

  if (versionQuery.isError || !versionQuery.data) {
    return <p className="px-2 py-4 text-sm text-red-700">Failed to load policy version.</p>;
  }

  const version = versionQuery.data;

  return (
    <main className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{version.versionNumber}</h1>
          <p className="text-sm text-slate-700">Status: {version.status}</p>
        </div>
        {version.status === 'DRAFT' ? (
          <PublishPolicyModal
            versionNumber={version.versionNumber}
            affectedStudentsCount={version.affectedStudentsCount}
            onConfirm={() => publishMutation.mutateAsync()}
            disabled={publishMutation.isPending}
          />
        ) : null}
      </div>

      <div>
        <PolicyRuleEditor
          status={version.status}
          initialDescription={version.description}
          initialRules={version.rules}
          onSave={(payload) => saveMutation.mutateAsync(payload)}
        />
      </div>

      {versionsQuery.data ? (
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold text-slate-900">All Versions</h2>
          <PolicyVersionList versions={versionsQuery.data.versions} />
        </section>
      ) : null}
    </main>
  );
}
