'use client';

type EvidenceLink = {
  id: string;
  usageNodeId: string | null;
  text?: string | null;
};

type EvidenceLinkListProps = {
  links: EvidenceLink[];
};

export function EvidenceLinkList({ links }: EvidenceLinkListProps) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-base font-semibold text-slate-900">Evidence Items</h2>
      {links.length === 0 ? (
        <p className="mt-2 text-sm text-slate-700">No evidence items were provided.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {links.map((link) => (
            <li key={link.id} className="rounded border border-slate-200 bg-slate-50 p-2">
              <p className="text-xs uppercase tracking-wide text-slate-500">
                Evidence
                {link.usageNodeId ? ` • Node: ${link.usageNodeId}` : ''}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-900">
                {link.text ?? 'Evidence entry'}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
