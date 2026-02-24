'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import { isReflectionTriggerType, type ReflectionTriggerType } from '@/lib/reflections/prompts';

type TriggerEntryResponse = {
  entry: {
    id: string;
    assignmentId: string;
    triggerType: ReflectionTriggerType;
    status: 'REQUIRED' | 'COMPLETED';
    requiredForUnlock: boolean;
    completedAt: string | null;
  };
};

type PromptResponse = {
  triggerType: ReflectionTriggerType;
  version: string;
  prompts: string[];
};

type CompleteResponse = {
  entry: {
    id: string;
    assignmentId: string;
    triggerType: ReflectionTriggerType;
    status: 'REQUIRED' | 'COMPLETED';
    completedAt: string | null;
  };
};

type ReflectionJournalPageProps = {
  assignmentId: string | null;
  triggerType: string | null;
  returnTo: string | null;
  action: string | null;
};

function safeReturnPath(returnTo: string | null, fallback: string): string {
  if (!returnTo || !returnTo.startsWith('/')) {
    return fallback;
  }
  return returnTo;
}

function appendToast(path: string, toast: string): string {
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}toast=${encodeURIComponent(toast)}`;
}

function blockPaste(event: FormEvent<HTMLTextAreaElement>) {
  const nativeEvent = event.nativeEvent as InputEvent;
  if (nativeEvent.inputType === 'insertFromPaste') {
    event.preventDefault();
  }
}

async function triggerReflection(payload: {
  assignmentId: string;
  triggerType: ReflectionTriggerType;
}): Promise<TriggerEntryResponse> {
  const response = await fetch('/api/reflections/trigger', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorPayload = (await response.json()) as { error?: string };
    throw new Error(errorPayload.error ?? 'Failed to start reflection');
  }

  return (await response.json()) as TriggerEntryResponse;
}

async function fetchPrompts(triggerType: ReflectionTriggerType): Promise<PromptResponse> {
  const response = await fetch(`/api/reflections/prompts?triggerType=${encodeURIComponent(triggerType)}`, {
    method: 'GET',
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('Failed to load reflection prompts');
  }

  return (await response.json()) as PromptResponse;
}

async function completeReflection(
  reflectionId: string,
  payload: { responses?: string[]; justificationText?: string },
): Promise<CompleteResponse> {
  const response = await fetch(`/api/reflections/${reflectionId}/complete`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorPayload = (await response.json()) as { error?: string };
    throw new Error(errorPayload.error ?? 'Failed to save reflection');
  }

  return (await response.json()) as CompleteResponse;
}

async function exportDeclaration(assignmentId: string) {
  const response = await fetch(`/api/declarations/${assignmentId}/export`, {
    method: 'POST',
  });

  if (!response.ok) {
    const errorPayload = (await response.json()) as { error?: string };
    throw new Error(errorPayload.error ?? 'Failed to export declaration');
  }
}

export function ReflectionJournalPage({
  assignmentId,
  triggerType,
  returnTo,
  action,
}: ReflectionJournalPageProps) {
  const router = useRouter();
  const [entry, setEntry] = useState<TriggerEntryResponse['entry'] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [responses, setResponses] = useState<string[]>([]);
  const [justificationText, setJustificationText] = useState('');

  const parsedTriggerType = useMemo(() => {
    if (!isReflectionTriggerType(triggerType)) {
      return null;
    }
    return triggerType;
  }, [triggerType]);

  const promptsQuery = useQuery({
    queryKey: ['reflection-prompts', parsedTriggerType],
    queryFn: () => fetchPrompts(parsedTriggerType as ReflectionTriggerType),
    enabled: Boolean(parsedTriggerType),
  });

  const triggerMutation = useMutation({
    mutationFn: triggerReflection,
    onSuccess: (payload) => {
      setEntry(payload.entry);
    },
  });

  const completeMutation = useMutation({
    mutationFn: ({ reflectionId, payload }: { reflectionId: string; payload: { responses?: string[]; justificationText?: string } }) =>
      completeReflection(reflectionId, payload),
  });

  useEffect(() => {
    if (!assignmentId || !parsedTriggerType) {
      return;
    }

    void triggerMutation
      .mutateAsync({
        assignmentId,
        triggerType: parsedTriggerType,
      })
      .catch((mutationError) => {
        setError((mutationError as Error).message);
      });
  }, [assignmentId, parsedTriggerType, triggerMutation]);

  if (!assignmentId || !parsedTriggerType) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          Missing or invalid reflection context.
        </p>
      </main>
    );
  }

  const fallbackPath = parsedTriggerType === 'STANDARD_EXPORT' ? `/declarations/${assignmentId}` : `/log?assignmentId=${encodeURIComponent(assignmentId)}`;
  const nextPath = safeReturnPath(returnTo, fallbackPath);

  async function onSubmit() {
    if (!entry) {
      return;
    }

    setError(null);

    try {
      if (parsedTriggerType === 'COMPLIANCE_SERIOUS') {
        const trimmed = justificationText.trim();
        if (trimmed.length === 0) {
          setError('A justification is required.');
          return;
        }

        await completeMutation.mutateAsync({
          reflectionId: entry.id,
          payload: {
            justificationText: trimmed,
          },
        });
      } else {
        const normalized = responses.map((item) => item.trim());
        if (normalized.some((item) => item.length === 0)) {
          setError('Answer all reflection prompts before saving.');
          return;
        }

        await completeMutation.mutateAsync({
          reflectionId: entry.id,
          payload: {
            responses: normalized,
          },
        });
      }

      if (action === 'export' && parsedTriggerType === 'STANDARD_EXPORT') {
        await exportDeclaration(assignmentId as string);
        router.push(appendToast(nextPath, 'declaration-exported'));
        return;
      }

      router.push(nextPath);
    } catch (submitError) {
      setError((submitError as Error).message || 'Unable to save reflection');
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl space-y-5 px-4 py-8 sm:px-6 lg:px-8">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Reflection Journal</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">
          {parsedTriggerType === 'COMPLIANCE_SERIOUS' ? 'Justification Entry' : 'Guided Reflection'}
        </h1>
        <p className="mt-2 text-sm text-slate-700">
          Paste is disabled in this module. Write your reflection manually.
        </p>
      </section>

      {error ? (
        <section className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</section>
      ) : null}

      {triggerMutation.isPending || promptsQuery.isLoading || !entry ? (
        <p className="text-sm text-slate-700">Loading reflection journal...</p>
      ) : null}

      {entry && !triggerMutation.isPending && !promptsQuery.isLoading ? (
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          {parsedTriggerType === 'COMPLIANCE_SERIOUS' ? (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-slate-900">Policy warning justification</p>
              <p className="text-sm text-slate-700">{promptsQuery.data?.prompts[0]}</p>
              <textarea
                value={justificationText}
                onChange={(event) => setJustificationText(event.target.value)}
                onPaste={(event) => event.preventDefault()}
                onBeforeInput={blockPaste}
                rows={8}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                placeholder="Explain necessity, alternatives considered, and risk mitigation steps."
              />
            </div>
          ) : (
            <div className="space-y-4">
              {promptsQuery.data?.prompts.map((prompt, index) => (
                <div key={prompt} className="space-y-2">
                  <p className="text-sm font-semibold text-slate-900">Prompt {index + 1}</p>
                  <p className="text-sm text-slate-700">{prompt}</p>
                  <textarea
                    value={responses[index] ?? ''}
                    onChange={(event) =>
                      setResponses((current) => {
                        const next = [...current];
                        next[index] = event.target.value;
                        return next;
                      })
                    }
                    onPaste={(event) => event.preventDefault()}
                    onBeforeInput={blockPaste}
                    rows={6}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                    placeholder="Write your reflection."
                  />
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => router.push(nextPath)}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void onSubmit()}
              disabled={completeMutation.isPending}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {completeMutation.isPending
                ? 'Saving...'
                : action === 'export' && parsedTriggerType === 'STANDARD_EXPORT'
                  ? 'Save Reflection and Export'
                  : 'Save Reflection'}
            </button>
          </div>
        </section>
      ) : null}
    </main>
  );
}
