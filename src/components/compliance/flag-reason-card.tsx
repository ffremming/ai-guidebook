'use client';

import Link from 'next/link';

import { ComplianceStatusBadge, type ComplianceStatusValue } from './compliance-status-badge';

type FlagReasonCardProps = {
  logId: string;
  userStatedIntent: string | null;
  systemClassification: string | null;
  ruleReference: string;
  complianceStatus: ComplianceStatusValue;
  conflictFlag?: boolean;
  directViolationFlag?: boolean;
};

function flagTypeLabel(conflictFlag: boolean, directViolationFlag: boolean): string {
  if (directViolationFlag) {
    return 'Direct Violation';
  }

  if (conflictFlag) {
    return 'Category Mismatch';
  }

  return 'Flagged';
}

export function FlagReasonCard({
  logId,
  userStatedIntent,
  systemClassification,
  ruleReference,
  complianceStatus,
  conflictFlag = false,
  directViolationFlag = false,
}: FlagReasonCardProps) {
  return (
    <article className="rounded-lg border border-slate-300 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <ComplianceStatusBadge status={complianceStatus} />
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-800">
          {flagTypeLabel(conflictFlag, directViolationFlag)}
        </span>
      </div>

      <div className="mt-3 grid gap-3 text-sm text-slate-900 sm:grid-cols-2">
        <div className="rounded-md border border-slate-200 p-3">
          <p className="font-semibold">User Stated Intent</p>
          <p className="mt-1">{userStatedIntent ?? 'Not provided'}</p>
        </div>
        <div className="rounded-md border border-slate-200 p-3">
          <p className="font-semibold">System Classification</p>
          <p className="mt-1">{systemClassification ?? 'Not classified'}</p>
        </div>
      </div>

      <p className="mt-3 text-sm text-slate-800">Rule reference: {ruleReference}</p>

      <Link
        href={`/resolve/${logId}`}
        className="mt-3 inline-flex rounded-md bg-[var(--brand)] px-3 py-2 text-sm font-semibold text-white"
      >
        Resolve
      </Link>
    </article>
  );
}
