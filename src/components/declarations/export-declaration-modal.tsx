'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import type { DeclarationData } from '@/hooks/useDeclaration';

type ExportDeclarationModalProps = {
  declarationData: DeclarationData | null;
  assignmentId: string;
  disabled?: boolean;
};

export function ExportDeclarationModal({
  declarationData,
  assignmentId,
  disabled = false,
}: ExportDeclarationModalProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  if (!declarationData) {
    return (
      <button
        type="button"
        disabled
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
      >
        Export Declaration
      </button>
    );
  }

  const previewPayload = {
    systemSummary: declarationData.declaration.systemSummary,
    studentRemarks: declarationData.declaration.studentRemarks,
    policyVersionNumber: declarationData.declaration.policyVersion.versionNumber,
    flags: declarationData.flags.map((flag) => ({
      logId: flag.logId,
      userStatedIntent: flag.userStatedIntent,
      systemClassification: flag.systemClassification,
      conflictFlag: flag.conflictFlag,
      directViolationFlag: flag.directViolationFlag,
      ruleReference: flag.ruleReference,
      resolution: flag.resolution,
    })),
  };

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
      >
        Export Declaration
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-lg bg-white p-4 sm:p-6">
            <h2 className="text-lg font-semibold text-slate-900">Export Declaration</h2>
            <p className="mt-1 text-sm text-slate-700">
              Confirm the final content before exporting.
            </p>

            <pre className="mt-4 overflow-auto rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-900">
              {JSON.stringify(previewPayload, null, 2)}
            </pre>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const returnTo = `/declarations/${assignmentId}`;
                  router.push(
                    `/reflections?assignmentId=${encodeURIComponent(
                      assignmentId,
                    )}&triggerType=STANDARD_EXPORT&action=export&returnTo=${encodeURIComponent(
                      returnTo,
                    )}`,
                  );
                }}
                className="rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white"
              >
                Continue to Reflection
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
