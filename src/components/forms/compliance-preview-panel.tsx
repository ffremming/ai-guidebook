'use client';

type CompliancePreviewPanelProps = {
  isLoading: boolean;
  status: 'PENDING' | 'COMPLIANT' | 'WARNING' | 'NON_COMPLIANT' | null;
  message: string | null;
  detectedCategory: string | null;
  ruleReferences: string[];
};

function statusStyles(status: CompliancePreviewPanelProps['status']) {
  if (status === 'COMPLIANT') {
    return 'border-emerald-300 bg-emerald-50 text-emerald-900';
  }
  if (status === 'WARNING') {
    return 'border-amber-300 bg-amber-50 text-amber-900';
  }
  if (status === 'NON_COMPLIANT') {
    return 'border-red-300 bg-red-50 text-red-900';
  }
  return 'border-slate-300 bg-slate-50 text-slate-900';
}

export function CompliancePreviewPanel({
  isLoading,
  status,
  message,
  detectedCategory,
  ruleReferences,
}: CompliancePreviewPanelProps) {
  if (isLoading) {
    return (
      <section className="rounded-md border border-slate-300 bg-white p-3">
        <p className="text-sm text-slate-700">Checking compliance...</p>
      </section>
    );
  }

  if (!status) {
    return null;
  }

  return (
    <section className={`rounded-md border p-3 ${statusStyles(status)}`}>
      <p className="text-sm font-semibold">{status.replace('_', ' ')}</p>
      {detectedCategory ? <p className="mt-1 text-sm">Detected category: {detectedCategory}</p> : null}
      {message ? <p className="mt-1 text-sm">{message}</p> : null}
      {ruleReferences.length > 0 ? (
        <p className="mt-1 text-sm">Rule reference: {ruleReferences.join(', ')}</p>
      ) : null}
    </section>
  );
}
