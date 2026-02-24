'use client';

import { useState } from 'react';

import type { DeclarationData, DeclarationExportResponse } from '@/hooks/useDeclaration';

type ExportDeclarationModalProps = {
  declarationData: DeclarationData | null;
  disabled?: boolean;
  onConfirmExport: () => Promise<DeclarationExportResponse>;
};

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ExportDeclarationModal({
  declarationData,
  disabled = false,
  onConfirmExport,
}: ExportDeclarationModalProps) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  setIsSubmitting(true);
                  try {
                    const exported = await onConfirmExport();
                    downloadJson(
                      `declaration-${declarationData.declaration.assignmentId}.json`,
                      exported,
                    );
                    setOpen(false);
                  } finally {
                    setIsSubmitting(false);
                  }
                }}
                className="rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Exporting...' : 'Confirm Export'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
