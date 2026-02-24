'use client';

import { useEffect, useRef, useState } from 'react';

type StudentRemarksEditorProps = {
  initialValue: string;
  disabled?: boolean;
  onSave: (value: string) => Promise<unknown>;
};

export function StudentRemarksEditor({
  initialValue,
  disabled = false,
  onSave,
}: StudentRemarksEditorProps) {
  const [value, setValue] = useState(initialValue);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const isFirstRender = useRef(true);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  useEffect(() => {
    if (disabled) {
      return;
    }

    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    const timer = setTimeout(async () => {
      setSaveState('saving');
      try {
        await onSave(value);
        setSaveState('saved');
      } catch {
        setSaveState('error');
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [disabled, onSave, value]);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <h2 className="text-lg font-semibold text-slate-900">Student Remarks</h2>
      <textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        disabled={disabled}
        rows={14}
        className="mt-3 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100"
        placeholder="Add your remarks for this declaration..."
      />
      <p className="mt-2 text-sm text-slate-700">
        {saveState === 'saving' ? 'Saving...' : null}
        {saveState === 'saved' ? 'Saved' : null}
        {saveState === 'error' ? 'Save failed' : null}
      </p>
    </section>
  );
}
