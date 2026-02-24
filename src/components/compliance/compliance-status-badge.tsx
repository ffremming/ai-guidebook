'use client';

export type ComplianceStatusValue = 'COMPLIANT' | 'WARNING' | 'NON_COMPLIANT' | 'PENDING';

type ComplianceStatusBadgeProps = {
  status: ComplianceStatusValue;
};

function statusStyles(status: ComplianceStatusValue): string {
  if (status === 'COMPLIANT') {
    return 'border-emerald-300 bg-emerald-50 text-emerald-900';
  }

  if (status === 'WARNING') {
    return 'border-amber-300 bg-amber-50 text-amber-900';
  }

  if (status === 'NON_COMPLIANT') {
    return 'border-red-300 bg-red-50 text-red-900';
  }

  return 'border-slate-300 bg-slate-100 text-slate-800';
}

export function ComplianceStatusBadge({ status }: ComplianceStatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${statusStyles(status)}`}
    >
      {status.replace('_', ' ')}
    </span>
  );
}
