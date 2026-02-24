'use client';

type ResolutionStatus = 'NONE' | 'UNRESOLVED' | 'STUDENT_RESPONDED';

type ResolutionStatusBadgeProps = {
  status: ResolutionStatus;
};

function statusStyles(status: ResolutionStatus): string {
  if (status === 'STUDENT_RESPONDED') {
    return 'border-emerald-300 bg-emerald-50 text-emerald-900';
  }

  if (status === 'UNRESOLVED') {
    return 'border-amber-300 bg-amber-50 text-amber-900';
  }

  return 'border-slate-300 bg-slate-100 text-slate-800';
}

function statusLabel(status: ResolutionStatus): string {
  if (status === 'STUDENT_RESPONDED') {
    return 'Student Responded';
  }

  if (status === 'UNRESOLVED') {
    return 'Unresolved';
  }

  return 'None';
}

export function ResolutionStatusBadge({ status }: ResolutionStatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${statusStyles(status)}`}
    >
      {statusLabel(status)}
    </span>
  );
}
