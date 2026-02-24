'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';

type ReflectionNoteItem = {
  id: string;
  content: string;
  createdAt: string;
};

type ReflectionNotesResponse = {
  notes: ReflectionNoteItem[];
};

type ValidationErrorPayload = {
  error: string;
  fields?: Record<string, string[]>;
};

async function fetchReflectionNotes(): Promise<ReflectionNotesResponse> {
  const response = await fetch('/api/reflection-notes', {
    method: 'GET',
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('Failed to load reflections');
  }

  return (await response.json()) as ReflectionNotesResponse;
}

async function createReflectionNote(payload: {
  content: string;
}): Promise<ReflectionNotesResponse['notes'][number]> {
  const response = await fetch('/api/reflection-notes', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorPayload = (await response.json()) as ValidationErrorPayload;
    throw errorPayload;
  }

  const body = (await response.json()) as { note: ReflectionNotesResponse['notes'][number] };
  return body.note;
}

export function ReflectionJournalPage() {
  const [content, setContent] = useState('');
  const [error, setError] = useState<string | null>(null);

  const notesQuery = useQuery({
    queryKey: ['reflection-notes'],
    queryFn: fetchReflectionNotes,
  });

  const createMutation = useMutation({
    mutationFn: createReflectionNote,
    onSuccess: async () => {
      setContent('');
      setError(null);
      await notesQuery.refetch();
    },
    onError: (err) => {
      const payload = err as unknown as ValidationErrorPayload;
      setError(payload.error ?? 'Unable to save reflection');
    },
  });

  async function onSubmit() {
    setError(null);

    if (content.trim().length === 0) {
      setError('Write a reflection before submitting.');
      return;
    }

    await createMutation.mutateAsync({
      content: content.trim(),
    });
  }

  if (notesQuery.isLoading) {
    return <p className="px-4 py-6 text-sm text-slate-700">Loading reflections...</p>;
  }

  if (notesQuery.isError) {
    return <p className="px-4 py-6 text-sm text-red-700">Failed to load reflections.</p>;
  }

  return (
    <main className="mx-auto w-full max-w-4xl space-y-5 px-4 py-8 sm:px-6 lg:px-8">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Reflection Journal</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">New Reflection</h1>
        <p className="mt-2 text-sm text-slate-700">Write and save reflection entries.</p>
      </section>

      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="block text-sm font-medium text-slate-900">
          Reflection
          <textarea
            rows={6}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            placeholder="Write your reflection..."
          />
        </label>

        {error ? <p className="text-sm text-red-700">{error}</p> : null}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => void onSubmit()}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? 'Saving...' : 'Save reflection'}
          </button>
        </div>
      </section>

      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Saved Reflections</h2>

        {notesQuery.data?.notes.length ? (
          <div className="space-y-2">
            {notesQuery.data.notes.map((note) => (
              <article key={note.id} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs text-slate-500">
                  {new Date(note.createdAt).toLocaleString()}
                </p>
                <p className="mt-1 text-sm text-slate-800 whitespace-pre-wrap">{note.content}</p>
              </article>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-600">No reflections saved yet.</p>
        )}
      </section>
    </main>
  );
}
