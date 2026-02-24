'use client';

import { FlagReasonCard } from '@/components/compliance/flag-reason-card';
import { useDeclaration } from '@/hooks/useDeclaration';

import { ExportDeclarationModal } from './export-declaration-modal';
import { PolicyVersionBadge } from './policy-version-badge';
import { StudentRemarksEditor } from './student-remarks-editor';

type DeclarationDraftViewProps = {
  assignmentId: string;
};

export function DeclarationDraftView({ assignmentId }: DeclarationDraftViewProps) {
  const { data, isLoading, isError, saveRemarks, exportDeclaration, isExporting } =
    useDeclaration(assignmentId);

  if (isLoading) {
    return <p className="px-4 py-6 text-sm text-slate-700 sm:px-6">Loading declaration...</p>;
  }

  if (isError || !data) {
    return (
      <p className="px-4 py-6 text-sm text-red-700 sm:px-6">
        Failed to load declaration for this assignment.
      </p>
    );
  }

  const isExported = data.declaration.status === 'EXPORTED';

  return (
    <main className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <PolicyVersionBadge
          versionNumber={data.declaration.policyVersion.versionNumber}
          publishedAt={data.declaration.policyVersion.publishedAt}
        />
        <span className="rounded-full border border-slate-300 bg-slate-50 px-3 py-1 text-sm text-slate-900">
          Status: {isExported ? 'Exported' : 'Draft'}
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <h2 className="text-lg font-semibold text-slate-900">System Generated Summary</h2>
          <pre className="mt-3 max-h-[50vh] overflow-auto whitespace-pre-wrap text-sm text-slate-800">
            {data.declaration.systemSummary}
          </pre>

          <div className="mt-5 space-y-3">
            <h3 className="text-base font-semibold text-slate-900">Flags</h3>
            {data.flags.length === 0 ? (
              <p className="text-sm text-slate-700">No flagged logs for this assignment.</p>
            ) : null}
            {data.flags.map((flag) => (
              <div key={flag.logId} className="space-y-2">
                <FlagReasonCard
                  logId={flag.logId}
                  complianceStatus={flag.complianceStatus}
                  userStatedIntent={flag.userStatedIntent}
                  systemClassification={flag.systemClassification}
                  conflictFlag={flag.conflictFlag}
                  directViolationFlag={flag.directViolationFlag}
                  ruleReference={flag.ruleReference}
                />
                {flag.resolution ? (
                  <div className="rounded-md border border-slate-200 bg-[var(--surface-muted)] p-3 text-sm text-slate-800">
                    <p className="font-semibold">Student Resolution</p>
                    <p className="mt-1 whitespace-pre-wrap">{flag.resolution.narrativeExplanation}</p>
                    {flag.resolution.disputedCategory ? (
                      <p className="mt-1">
                        Disputed category: {flag.resolution.disputedCategory}
                      </p>
                    ) : null}
                    {flag.resolution.disputeEvidence ? (
                      <p className="mt-1 whitespace-pre-wrap">
                        Evidence: {flag.resolution.disputeEvidence}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>

        <div className="space-y-4">
          <StudentRemarksEditor
            initialValue={data.declaration.studentRemarks ?? ''}
            disabled={isExported}
            onSave={saveRemarks}
          />
          <ExportDeclarationModal
            declarationData={data}
            disabled={isExported || isExporting}
            onConfirmExport={exportDeclaration}
          />
        </div>
      </div>
    </main>
  );
}
