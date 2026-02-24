'use client';

import { useState } from 'react';

type PublishPolicyModalProps = {
  versionNumber: string;
  affectedStudentsCount: number;
  disabled?: boolean;
  onConfirm: () => Promise<unknown>;
};

export function PublishPolicyModal({
  versionNumber,
  affectedStudentsCount,
  disabled = false,
  onConfirm,
}: PublishPolicyModalProps) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
      >
        Publish Version
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-5">
            <h2 className="text-lg font-semibold text-slate-900">Publish Policy Version</h2>
            <p className="mt-2 text-sm text-slate-700">
              You are about to publish <span className="font-semibold">{versionNumber}</span>.
            </p>
            <p className="mt-2 text-sm text-slate-700">
              {affectedStudentsCount} students with active assignments will receive a change
              notification.
            </p>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={isSubmitting}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  setIsSubmitting(true);
                  try {
                    await onConfirm();
                    setOpen(false);
                  } finally {
                    setIsSubmitting(false);
                  }
                }}
                disabled={isSubmitting}
                className="rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {isSubmitting ? 'Publishing...' : 'Confirm Publish'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
