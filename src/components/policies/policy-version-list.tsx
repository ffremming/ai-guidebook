'use client';

import Link from 'next/link';

type PolicyVersion = {
  id: string;
  versionNumber: string;
  description: string | null;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  createdAt: string;
};

type PolicyVersionListProps = {
  versions: PolicyVersion[];
};

function statusStyles(status: PolicyVersion['status']): string {
  if (status === 'ACTIVE') {
    return 'border-emerald-300 bg-emerald-50 text-emerald-900';
  }
  if (status === 'DRAFT') {
    return 'border-amber-300 bg-amber-50 text-amber-900';
  }
  return 'border-slate-300 bg-slate-100 text-slate-800';
}

export function PolicyVersionList({ versions }: PolicyVersionListProps) {
  if (versions.length === 0) {
    return <p className="text-sm text-slate-700">No policy versions found.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-slate-800">
          <tr>
            <th className="px-3 py-2 font-semibold">Version</th>
            <th className="px-3 py-2 font-semibold">Description</th>
            <th className="px-3 py-2 font-semibold">Status</th>
            <th className="px-3 py-2 font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody>
          {versions.map((version) => (
            <tr key={version.id} className="border-b border-slate-100 last:border-b-0">
              <td className="px-3 py-2 font-medium text-slate-900">{version.versionNumber}</td>
              <td className="px-3 py-2 text-slate-700">{version.description || 'No description'}</td>
              <td className="px-3 py-2">
                <span
                  className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${statusStyles(version.status)}`}
                >
                  {version.status}
                </span>
              </td>
              <td className="px-3 py-2">
                <Link href={`/policies/${version.id}`} className="font-medium text-slate-900 underline">
                  Open
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
