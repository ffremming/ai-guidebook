'use client';

type PolicyVersionBadgeProps = {
  versionNumber: string;
  publishedAt: string | null;
};

function formatDate(value: string | null): string {
  if (!value) {
    return 'Unpublished';
  }

  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

export function PolicyVersionBadge({ versionNumber, publishedAt }: PolicyVersionBadgeProps) {
  return (
    <div className="inline-flex rounded-full border border-slate-300 bg-slate-50 px-3 py-1 text-sm font-medium text-slate-900">
      {versionNumber} · Published {formatDate(publishedAt)}
    </div>
  );
}
