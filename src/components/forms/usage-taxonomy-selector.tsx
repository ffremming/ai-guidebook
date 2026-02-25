import { useMemo, useState } from 'react';

import { getUsageTreeRootNodes, type UsageTreeNode } from '@/lib/usage-taxonomy';

type UsageNodeStatus = 'ALLOWED' | 'DISALLOWED' | 'MIXED';

type UsageTaxonomySelectorProps = {
  value: {
    usageSubsections: string[];
    usageEvidence: Array<{
      nodeId: string;
      text: string;
    }>;
  };
  errors: {
    usageSubsections?: string;
  };
  nodeStatusById?: Record<string, UsageNodeStatus>;
  conflictNodeIds?: string[];
  onSubsectionToggle: (subsectionId: string, checked: boolean) => void;
  onAddEvidence: (nodeId: string) => void;
  onRemoveEvidence: (index: number) => void;
  onUpdateEvidence: (
    index: number,
    patch: Partial<{
      nodeId: string;
      text: string;
    }>,
  ) => void;
};

function filterTree(nodes: UsageTreeNode[], query: string): UsageTreeNode[] {
  if (!query.trim()) {
    return nodes;
  }

  const loweredNeedle = query.trim().toLowerCase();
  const result: UsageTreeNode[] = [];

  for (const node of nodes) {
    const matchesSelf = node.label.toLowerCase().includes(loweredNeedle);
    const filteredChildren = node.children ? filterTree(node.children, query) : [];

    if (matchesSelf || filteredChildren.length > 0) {
      result.push({
        ...node,
        children: matchesSelf ? node.children : filteredChildren,
      });
    }
  }

  return result;
}

export function UsageTaxonomySelector({
  value,
  errors,
  nodeStatusById,
  conflictNodeIds = [],
  onSubsectionToggle,
  onAddEvidence,
  onRemoveEvidence,
  onUpdateEvidence,
}: UsageTaxonomySelectorProps) {
  const rootNodes = useMemo(() => getUsageTreeRootNodes(), []);
  const [query, setQuery] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const conflictNodeIdSet = useMemo(() => new Set(conflictNodeIds), [conflictNodeIds]);

  const allNodeIds = useMemo(() => {
    const ids = new Set<string>();
    const stack: UsageTreeNode[] = [...rootNodes];
    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) continue;
      ids.add(current.id);
      if (current.children && current.children.length > 0) {
        stack.push(...current.children);
      }
    }
    return ids;
  }, [rootNodes]);

  function toggleExpanded(nodeId: string) {
    setExpandedIds((previous) => {
      const next = new Set(previous);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }

  const visibleNodes = useMemo(() => filterTree(rootNodes, query), [query, rootNodes]);

  function renderTreeNode(node: UsageTreeNode, depth: number) {
    const hasChildren = Boolean(node.children && node.children.length > 0);
    const expanded = expandedIds.has(node.id);
    const checked = value.usageSubsections.includes(node.id);
    const isConflict = checked && conflictNodeIdSet.has(node.id);
    const nodeStatus = nodeStatusById?.[node.id];
    const evidenceForNode = value.usageEvidence
      .map((item, index) => ({ ...item, index }))
      .filter((item) => item.nodeId === node.id);
    const inputId = `usage-node-${node.id}`;

    return (
      <li key={node.id}>
        <div
          className="flex items-start gap-2 rounded-sm py-1"
          style={{ paddingLeft: `${depth * 16}px` }}
        >
          {hasChildren ? (
            <button
              type="button"
              onClick={() => toggleExpanded(node.id)}
              className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded border border-slate-300 text-xs text-slate-700"
              aria-label={expanded ? `Collapse ${node.label}` : `Expand ${node.label}`}
              aria-expanded={expanded}
            >
              {expanded ? '-' : '+'}
            </button>
          ) : (
            <span className="inline-block h-5 w-5" />
          )}

          <label htmlFor={inputId} className="flex cursor-pointer items-start gap-2 text-sm text-slate-800">
            <input
              id={inputId}
              type="checkbox"
              checked={checked}
              onChange={(event) => {
                const nextChecked = event.target.checked;
                onSubsectionToggle(node.id, nextChecked);

                if (nextChecked && hasChildren) {
                  setExpandedIds((previous) => {
                    const next = new Set(previous);
                    next.add(node.id);
                    return next;
                  });
                }
              }}
              className="mt-0.5"
            />
            <span className="inline-flex items-center gap-2">
              <span>{node.label}</span>
              {nodeStatus ? (
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                    nodeStatus === 'ALLOWED'
                      ? 'border border-emerald-300 bg-emerald-100 text-emerald-800'
                      : nodeStatus === 'DISALLOWED'
                        ? 'border border-red-300 bg-red-100 text-red-800'
                        : 'border border-amber-300 bg-amber-100 text-amber-800'
                  }`}
                >
                  {nodeStatus}
                </span>
              ) : null}
              {isConflict ? (
                <span className="rounded-full border border-red-300 bg-red-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-800">
                  Conflict
                </span>
              ) : null}
            </span>
          </label>
        </div>

        {checked && depth > 0 && !hasChildren ? (
          <div style={{ paddingLeft: `${depth * 16 + 28}px` }} className="space-y-2 py-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Node Evidence
              </p>
              <button
                type="button"
                onClick={() => onAddEvidence(node.id)}
                className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700"
              >
                Add URL or comment
              </button>
            </div>

            {evidenceForNode.length === 0 ? (
              <p className="text-xs text-slate-500">No evidence attached to this node yet.</p>
            ) : (
              evidenceForNode.map((item) => (
                <div key={item.index} className="rounded border border-slate-200 bg-slate-50 p-2">
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => onRemoveEvidence(item.index)}
                      className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700"
                    >
                      Remove
                    </button>
                  </div>
                  <textarea
                    value={item.text}
                    onChange={(event) =>
                      onUpdateEvidence(item.index, {
                        text: event.target.value,
                      })
                    }
                    placeholder="Add URL or comment..."
                    rows={3}
                    className="mt-2 w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900"
                  />
                </div>
              ))
            )}
          </div>
        ) : null}

        {hasChildren && expanded ? (
          <ul className="space-y-1">{node.children?.map((child) => renderTreeNode(child, depth + 1))}</ul>
        ) : null}
      </li>
    );
  }

  return (
    <section className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="space-y-2 rounded-md border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setExpandedIds(new Set(allNodeIds))}
              className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700"
            >
              Expand all
            </button>
            <button
              type="button"
              onClick={() => setExpandedIds(new Set())}
              className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700"
            >
              Collapse all
            </button>
          </div>
        </div>
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search the tree..."
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
        />
        <ul className="space-y-1">
          {visibleNodes.map((node) => renderTreeNode(node, 0))}
        </ul>
        {visibleNodes.length === 0 ? (
          <p className="text-xs text-slate-600">No matching nodes.</p>
        ) : null}
      </div>

      {errors.usageSubsections ? (
        <p className="text-sm text-red-700">{errors.usageSubsections}</p>
      ) : null}
    </section>
  );
}
