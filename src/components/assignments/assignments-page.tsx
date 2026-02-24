'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';

type AssignmentItem = {
  id: string;
  courseId: string;
  title: string;
  assignmentCode: string;
  description: string | null;
  dueDate: string | null;
  status: 'ACTIVE' | 'CLOSED';
  hasLog?: boolean;
  course: {
    id: string;
    courseCode: string;
    name: string;
    institution: string;
  };
};

type AssignmentsResponse = {
  assignments: AssignmentItem[];
};

type StudentLog = {
  id: string;
  assignmentId: string;
  createdAt: string;
};

type LogsResponse = {
  logs: StudentLog[];
};

type AssignmentUsageTreeNode = {
  id: string;
  label: string;
  status: 'ALLOWED' | 'DISALLOWED' | 'MIXED';
  children?: AssignmentUsageTreeNode[];
};

type AssignmentUsageTreeResponse = {
  tree: AssignmentUsageTreeNode[];
};

async function fetchAssignments(): Promise<AssignmentsResponse> {
  const response = await fetch('/api/assignments', {
    method: 'GET',
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('Failed to load assignments');
  }

  return (await response.json()) as AssignmentsResponse;
}

async function fetchLogs(): Promise<LogsResponse> {
  const response = await fetch('/api/logs', {
    method: 'GET',
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('Failed to load logs');
  }

  return (await response.json()) as LogsResponse;
}

async function fetchAssignmentUsageTree(assignmentId: string): Promise<AssignmentUsageTreeResponse> {
  const response = await fetch(`/api/assignments/${assignmentId}/usage-tree`, {
    method: 'GET',
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('Failed to load assignment usage tree');
  }

  return (await response.json()) as AssignmentUsageTreeResponse;
}

function dueDateLabel(dueDate: string | null): string {
  if (!dueDate) {
    return 'No deadline';
  }

  return new Date(dueDate).toLocaleDateString();
}

function resolveLoggingTag(
  assignment: AssignmentItem,
): {
  label: 'COMPLETED' | 'NEEDS LOGGING' | 'OVERDUE';
  className: string;
} {
  if (assignment.hasLog) {
    return {
      label: 'COMPLETED',
      className: 'border-emerald-300 bg-emerald-100 text-emerald-800',
    };
  }

  const dueDate = assignment.dueDate ? new Date(assignment.dueDate) : null;
  const isOverdue = Boolean(dueDate && dueDate.getTime() < Date.now());

  if (isOverdue) {
    return {
      label: 'OVERDUE',
      className: 'border-red-300 bg-red-100 text-red-800',
    };
  }

  return {
    label: 'NEEDS LOGGING',
    className: 'border-amber-300 bg-amber-100 text-amber-800',
  };
}

function collectNodeIds(nodes: AssignmentUsageTreeNode[]): string[] {
  const ids: string[] = [];
  const stack = [...nodes];

  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) {
      continue;
    }
    ids.push(node.id);
    if (node.children && node.children.length > 0) {
      stack.push(...node.children);
    }
  }

  return ids;
}

function collectExpandedPathIdsForDisallowedLeaves(nodes: AssignmentUsageTreeNode[]): string[] {
  const expanded = new Set<string>();

  const visit = (node: AssignmentUsageTreeNode, path: string[]) => {
    const nextPath = [...path, node.id];
    const children = node.children ?? [];
    const isLeaf = children.length === 0;

    if (isLeaf && node.status === 'DISALLOWED') {
      for (const id of path) {
        expanded.add(id);
      }
      return;
    }

    for (const child of children) {
      visit(child, nextPath);
    }
  };

  for (const node of nodes) {
    visit(node, []);
  }

  return Array.from(expanded);
}

function UsageTree({
  nodes,
  expandedIds,
  onToggle,
}: {
  nodes: AssignmentUsageTreeNode[];
  expandedIds: Set<string>;
  onToggle: (nodeId: string) => void;
}) {
  return (
    <div className="space-y-2">
      {nodes.map((node) => (
        <div key={node.id} className="rounded-md border border-slate-200 bg-white p-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {node.children && node.children.length > 0 ? (
                <button
                  type="button"
                  onClick={() => onToggle(node.id)}
                  className="inline-flex h-5 w-5 items-center justify-center rounded border border-slate-300 text-[10px] text-slate-700"
                >
                  {expandedIds.has(node.id) ? '-' : '+'}
                </button>
              ) : (
                <span className="inline-block h-5 w-5" />
              )}
              <p className="text-xs font-medium text-slate-900">{node.label}</p>
            </div>
            <span
              className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                node.status === 'ALLOWED'
                  ? 'bg-emerald-100 text-emerald-800'
                  : node.status === 'DISALLOWED'
                    ? 'bg-red-100 text-red-800'
                    : 'bg-amber-100 text-amber-800'
              }`}
            >
              {node.status}
            </span>
          </div>
          {node.children && node.children.length > 0 && expandedIds.has(node.id) ? (
            <div className="mt-2 border-l border-slate-200 pl-2">
              <UsageTree
                nodes={node.children}
                expandedIds={expandedIds}
                onToggle={onToggle}
              />
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function AssignmentsPage() {
  const [expandedAssignmentId, setExpandedAssignmentId] = useState<string | null>(null);
  const [expandedTreeNodeIdsByAssignment, setExpandedTreeNodeIdsByAssignment] = useState<
    Record<string, string[]>
  >({});
  const assignmentsQuery = useQuery({
    queryKey: ['assignments-page-list'],
    queryFn: fetchAssignments,
  });
  const logsQuery = useQuery({
    queryKey: ['assignments-page-logs'],
    queryFn: fetchLogs,
  });
  const assignmentTreeQuery = useQuery({
    queryKey: ['assignment-usage-tree-assignment-page', expandedAssignmentId],
    queryFn: () => fetchAssignmentUsageTree(expandedAssignmentId as string),
    enabled: Boolean(expandedAssignmentId),
  });

  const assignments = useMemo(
    () => assignmentsQuery.data?.assignments ?? [],
    [assignmentsQuery.data?.assignments],
  );
  const expandedTreeNodeIds = useMemo(() => {
    if (!expandedAssignmentId) {
      return new Set<string>();
    }

    const persisted = expandedTreeNodeIdsByAssignment[expandedAssignmentId];
    if (persisted) {
      return new Set(persisted);
    }

    return new Set(
      collectExpandedPathIdsForDisallowedLeaves(assignmentTreeQuery.data?.tree ?? []),
    );
  }, [
    assignmentTreeQuery.data?.tree,
    expandedAssignmentId,
    expandedTreeNodeIdsByAssignment,
  ]);

  const latestLogByAssignmentId = useMemo(() => {
    const map = new Map<string, StudentLog>();
    for (const log of logsQuery.data?.logs ?? []) {
      const existing = map.get(log.assignmentId);
      if (!existing || new Date(log.createdAt).getTime() > new Date(existing.createdAt).getTime()) {
        map.set(log.assignmentId, log);
      }
    }
    return map;
  }, [logsQuery.data?.logs]);

  if (assignmentsQuery.isLoading || logsQuery.isLoading) {
    return <p className="px-2 py-4 text-sm text-slate-700">Loading assignments...</p>;
  }

  if (assignmentsQuery.isError || logsQuery.isError) {
    return <p className="px-2 py-4 text-sm text-red-700">Failed to load assignments.</p>;
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-gradient-to-r from-white via-slate-50 to-white p-4">
        <h1 className="text-2xl font-semibold text-slate-900">Assignments</h1>
        <p className="mt-1 text-sm text-slate-700">
          Browse all assignments linked to your enrolled subjects.
        </p>
      </section>

      {assignments.length === 0 ? (
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-700">No assignments found yet.</p>
        </section>
      ) : (
        <section className="space-y-3">
          {assignments.map((assignment) => (
            <article key={assignment.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              {(() => {
                const loggingTag = resolveLoggingTag(assignment);
                return (
                  <div className="mb-2 flex justify-end">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${loggingTag.className}`}
                    >
                      {loggingTag.label}
                    </span>
                  </div>
                );
              })()}
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {assignment.course.courseCode} • {assignment.assignmentCode}
                  </p>
                  <h2 className="mt-1 text-base font-semibold text-slate-900">{assignment.title}</h2>
                  <p className="mt-1 text-xs text-slate-600">{assignment.course.name}</p>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    assignment.status === 'ACTIVE'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {assignment.status}
                </span>
              </div>

              {assignment.description ? (
                <p className="mt-2 text-sm text-slate-700">{assignment.description}</p>
              ) : null}

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-slate-600">Due: {dueDateLabel(assignment.dueDate)}</p>
                <button
                  type="button"
                  onClick={() =>
                    setExpandedAssignmentId((current) =>
                      current === assignment.id ? null : assignment.id,
                    )
                  }
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800"
                >
                  {expandedAssignmentId === assignment.id ? 'Hide AI usage tree' : 'View AI usage tree'}
                </button>
                {latestLogByAssignmentId.has(assignment.id) ? (
                  <Link
                    href={`/log?logId=${encodeURIComponent(
                      latestLogByAssignmentId.get(assignment.id)?.id ?? '',
                    )}`}
                    className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800"
                  >
                    View log
                  </Link>
                ) : (
                  <Link
                    href={`/log?assignmentId=${encodeURIComponent(assignment.id)}`}
                    className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    Log AI usage
                  </Link>
                )}
              </div>
              {expandedAssignmentId === assignment.id ? (
                <section className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Allowed/Disallowed AI Usage Tree
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedTreeNodeIdsByAssignment((current) => ({
                            ...current,
                            [assignment.id]: collectNodeIds(assignmentTreeQuery.data?.tree ?? []),
                          }))
                        }
                        className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700"
                      >
                        Expand all
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedTreeNodeIdsByAssignment((current) => ({
                            ...current,
                            [assignment.id]: [],
                          }))
                        }
                        className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700"
                      >
                        Collapse all
                      </button>
                    </div>
                  </div>
                  {assignmentTreeQuery.isLoading ? (
                    <p className="mt-2 text-xs text-slate-700">Loading tree...</p>
                  ) : assignmentTreeQuery.isError || !assignmentTreeQuery.data ? (
                    <p className="mt-2 text-xs text-red-700">Failed to load usage tree.</p>
                  ) : (
                    <div className="mt-2">
                      <UsageTree
                        nodes={assignmentTreeQuery.data.tree}
                        expandedIds={expandedTreeNodeIds}
                        onToggle={(nodeId) =>
                          setExpandedTreeNodeIdsByAssignment((current) => {
                            const next = new Set(current[assignment.id] ?? []);
                            if (next.has(nodeId)) {
                              next.delete(nodeId);
                            } else {
                              next.add(nodeId);
                            }
                            return {
                              ...current,
                              [assignment.id]: Array.from(next),
                            };
                          })
                        }
                      />
                    </div>
                  )}
                </section>
              ) : null}
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
