'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';

import { FlagReasonCard } from '@/components/compliance/flag-reason-card';
import { useResolution } from '@/hooks/useResolution';

import { DisputeClassificationForm } from './dispute-classification-form';
import { EvidenceLinkList } from './evidence-link-list';
import { NarrativeExplanationForm } from './narrative-explanation-form';
import { ResolutionStatusBadge } from './resolution-status-badge';

type LogDetailResponse = {
  id: string;
  intentCategory: string | null;
  actualUsageCategory: string | null;
  complianceStatus: 'PENDING' | 'COMPLIANT' | 'WARNING' | 'NON_COMPLIANT';
  conflictFlag: boolean;
  directViolationFlag: boolean;
  resolutionStatus: 'NONE' | 'UNRESOLVED' | 'STUDENT_RESPONDED';
  conversationLinks: Array<{
    id: string;
    usageNodeId: string | null;
    evidenceType: string | null;
    url: string | null;
    comment: string | null;
    label: string | null;
  }>;
  complianceChecks: Array<{
    ruleReferences: string[];
  }>;
};

type ResolutionResponse = {
  resolution: {
    narrativeExplanation: string;
    disputedCategory: string | null;
    disputeEvidence: string | null;
    originalSystemCategory: string;
    submittedAt: string;
  } | null;
};

type ActivePolicyResponse = {
  rules: Array<{
    usageCategory: string;
  }>;
};

type ResolutionPaneProps = {
  logId: string;
};

type FieldErrors = Record<string, string[] | undefined>;

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

export function ResolutionPane({ logId }: ResolutionPaneProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const resolutionActions = useResolution();

  const [narrativeExplanation, setNarrativeExplanation] = useState('');
  const [disputedCategory, setDisputedCategory] = useState('');
  const [disputeEvidence, setDisputeEvidence] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [optimisticStatus, setOptimisticStatus] = useState<
    'NONE' | 'UNRESOLVED' | 'STUDENT_RESPONDED' | null
  >(null);

  const logQuery = useQuery({
    queryKey: ['log', logId],
    queryFn: () => fetchJson<LogDetailResponse>(`/api/logs/${logId}`),
  });

  const resolutionQuery = useQuery({
    queryKey: ['resolution', logId],
    queryFn: () => fetchJson<ResolutionResponse>(`/api/resolutions/${logId}`),
  });

  const policyQuery = useQuery({
    queryKey: ['active-policy-categories'],
    queryFn: () => fetchJson<ActivePolicyResponse>('/api/policies/active'),
    enabled: Boolean(logQuery.data?.conflictFlag),
  });

  const submitMutation = useMutation({
    mutationFn: async () =>
      resolutionActions.submit({
        logId,
        narrativeExplanation,
        disputedCategory: disputedCategory || undefined,
        disputeEvidence: disputeEvidence || undefined,
      }),
    onSuccess: async () => {
      setOptimisticStatus('STUDENT_RESPONDED');
      await queryClient.invalidateQueries({ queryKey: ['resolution', logId] });
      await queryClient.invalidateQueries({ queryKey: ['log', logId] });
      router.push('/dashboard?toast=resolution-submitted');
    },
  });

  if (logQuery.isLoading || resolutionQuery.isLoading) {
    return <p className="px-2 py-4 text-sm text-slate-700">Loading resolution data...</p>;
  }

  if (logQuery.isError || resolutionQuery.isError || !logQuery.data || !resolutionQuery.data) {
    return (
      <p className="px-2 py-4 text-sm text-red-700">
        Failed to load resolution information.
      </p>
    );
  }

  const log = logQuery.data;
  const resolution = resolutionQuery.data.resolution;
  const status = optimisticStatus ?? log.resolutionStatus;
  const isReadOnly = status === 'STUDENT_RESPONDED';
  const ruleReference = log.complianceChecks.flatMap((check) => check.ruleReferences)[0] ?? 'N/A';

  const categories = Array.from(
    new Set((policyQuery.data?.rules ?? []).map((rule) => rule.usageCategory)),
  ).sort((a, b) => a.localeCompare(b));

  return (
    <main className="space-y-4">
      <div className="flex items-center gap-2">
        <ResolutionStatusBadge status={status} />
      </div>

      <FlagReasonCard
        logId={logId}
        complianceStatus={log.complianceStatus}
        userStatedIntent={log.intentCategory}
        systemClassification={log.actualUsageCategory}
        conflictFlag={log.conflictFlag}
        directViolationFlag={log.directViolationFlag}
        ruleReference={ruleReference}
      />

      <div>
        <EvidenceLinkList links={log.conversationLinks} />
      </div>

      {isReadOnly ? (
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Submitted Resolution</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">
            {resolution?.narrativeExplanation ?? 'No resolution text available.'}
          </p>
          {resolution?.disputedCategory ? (
            <p className="mt-2 text-sm text-slate-800">
              Disputed category: {resolution.disputedCategory}
            </p>
          ) : null}
          {resolution?.disputeEvidence ? (
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">
              Evidence: {resolution.disputeEvidence}
            </p>
          ) : null}
        </section>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            setFieldErrors({});
            setSubmitError(null);
            submitMutation.mutate(undefined, {
              onError: (error) => {
                const payload = error as { error?: string; fields?: FieldErrors };
                setFieldErrors(payload.fields ?? {});
                setSubmitError(payload.error ?? 'Failed to submit resolution');
              },
            });
          }}
          noValidate
        >
          <NarrativeExplanationForm
            value={narrativeExplanation}
            onChange={setNarrativeExplanation}
            error={fieldErrors.narrativeExplanation?.[0]}
            disabled={submitMutation.isPending}
          />

          {log.conflictFlag ? (
            <DisputeClassificationForm
              systemCategory={log.actualUsageCategory}
              categories={categories}
              disputedCategory={disputedCategory}
              disputeEvidence={disputeEvidence}
              onDisputedCategoryChange={setDisputedCategory}
              onDisputeEvidenceChange={setDisputeEvidence}
              errors={{
                disputedCategory: fieldErrors.disputedCategory?.[0],
                disputeEvidence: fieldErrors.disputeEvidence?.[0],
              }}
              disabled={submitMutation.isPending}
            />
          ) : null}

          {submitError ? <p className="text-sm text-red-700">{submitError}</p> : null}

          <button
            type="submit"
            disabled={submitMutation.isPending}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {submitMutation.isPending ? 'Submitting...' : 'Submit Resolution'}
          </button>
        </form>
      )}
    </main>
  );
}
