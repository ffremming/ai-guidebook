'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  getTopLevelSectionsForSelections,
  getUsageTreeRootNodes,
  isLeafUsageNodeId,
} from '@/lib/usage-taxonomy';

type StudentLog = {
  id: string;
  assignmentId: string;
  assignmentTitle: string;
  courseCode: string;
  courseName: string;
  usageSubsections: string[];
  disallowedUsageNodeIds?: string[];
  warningUsageNodeIds?: string[];
  usageReason: string;
  sessionDescription: string | null;
  aiTool: string;
  actualUsageCategory?: string | null;
  createdAt: string;
  complianceStatus: 'PENDING' | 'COMPLIANT' | 'WARNING' | 'NON_COMPLIANT';
  resolutionStatus: 'NONE' | 'UNRESOLVED' | 'STUDENT_RESPONDED';
  conflictFlag?: boolean;
  directViolationFlag?: boolean;
};

type LogsResponse = {
  logs: StudentLog[];
};

type EffectiveComplianceStatus = StudentLog['complianceStatus'];

function normalizeToolLabel(raw: string | null | undefined): string {
  const firstLine = (raw ?? '')
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  if (!firstLine) {
    return 'Unspecified';
  }

  if (
    /^ai tool\/model:/i.test(firstLine) ||
    /^why you used ai/i.test(firstLine) ||
    /^session details/i.test(firstLine)
  ) {
    return 'Unspecified';
  }

  if (/^unknown$/i.test(firstLine)) {
    return 'Unspecified';
  }

  return firstLine;
}

function rootTypeColor(sectionId: string): {
  barClass: string;
  dotClass: string;
  labelClass: string;
} {
  if (sectionId === 'no-ai') {
    return {
      barClass: 'bg-slate-500',
      dotClass: 'bg-slate-500',
      labelClass: 'text-slate-700',
    };
  }

  if (sectionId === 'writing') {
    return {
      barClass: 'bg-sky-600',
      dotClass: 'bg-sky-500',
      labelClass: 'text-sky-700',
    };
  }

  if (sectionId === 'programming') {
    return {
      barClass: 'bg-emerald-600',
      dotClass: 'bg-emerald-500',
      labelClass: 'text-emerald-700',
    };
  }

  if (sectionId === 'research-and-ideation') {
    return {
      barClass: 'bg-violet-600',
      dotClass: 'bg-violet-500',
      labelClass: 'text-violet-700',
    };
  }

  if (sectionId === 'data-and-analysis') {
    return {
      barClass: 'bg-amber-600',
      dotClass: 'bg-amber-500',
      labelClass: 'text-amber-700',
    };
  }

  return {
    barClass: 'bg-rose-600',
    dotClass: 'bg-rose-500',
    labelClass: 'text-rose-700',
  };
}

async function fetchMyLogs(): Promise<StudentLog[]> {
  const response = await fetch('/api/logs', {
    method: 'GET',
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('Failed to load logs');
  }

  const payload = (await response.json()) as LogsResponse;
  return payload.logs;
}

function getEffectiveComplianceStatus(log: StudentLog): EffectiveComplianceStatus {
  if ((log.disallowedUsageNodeIds?.length ?? 0) > 0) {
    return 'NON_COMPLIANT';
  }
  if ((log.warningUsageNodeIds?.length ?? 0) > 0) {
    return 'WARNING';
  }
  if (log.complianceStatus === 'WARNING') {
    return 'COMPLIANT';
  }
  return log.complianceStatus;
}

export function MyLogsPanel() {
  const logsQuery = useQuery({
    queryKey: ['my-logs'],
    queryFn: fetchMyLogs,
  });

  const logs = useMemo(() => logsQuery.data ?? [], [logsQuery.data]);
  const usageNodeLabelMap = useMemo(() => {
    const result = new Map<string, string>();
    const stack = [...getUsageTreeRootNodes()];
    while (stack.length > 0) {
      const node = stack.pop();
      if (!node) {
        continue;
      }
      result.set(node.id, node.label);
      if (node.children && node.children.length > 0) {
        stack.push(...node.children);
      }
    }
    return result;
  }, []);
  const stats = useMemo(() => {
    const toolCounts = new Map<string, number>();
    const categoryCounts = new Map<string, number>();
    const activityCounts = new Map<string, number>();
    const nonCompliantActivityCounts = new Map<string, number>();
    let unspecifiedToolCount = 0;
    let uncategorizedRootCount = 0;
    let nonCompliant = 0;
    let warnings = 0;

    for (const log of logs) {
      const normalizedTool = normalizeToolLabel(log.aiTool);
      if (normalizedTool === 'Unspecified') {
        unspecifiedToolCount += 1;
      } else {
        toolCounts.set(normalizedTool, (toolCounts.get(normalizedTool) ?? 0) + 1);
      }

      const rootSections = getTopLevelSectionsForSelections(log.usageSubsections ?? []);
      if (rootSections.length === 0) {
        uncategorizedRootCount += 1;
      } else {
        for (const section of rootSections) {
          categoryCounts.set(section.label, (categoryCounts.get(section.label) ?? 0) + 1);
        }
      }
      for (const nodeId of log.usageSubsections ?? []) {
        if (!isLeafUsageNodeId(nodeId)) {
          continue;
        }
        activityCounts.set(nodeId, (activityCounts.get(nodeId) ?? 0) + 1);
      }
      for (const nodeId of log.disallowedUsageNodeIds ?? []) {
        if (!isLeafUsageNodeId(nodeId)) {
          continue;
        }
        nonCompliantActivityCounts.set(
          nodeId,
          (nonCompliantActivityCounts.get(nodeId) ?? 0) + 1,
        );
      }

      const effectiveStatus = getEffectiveComplianceStatus(log);
      if (effectiveStatus === 'NON_COMPLIANT') {
        nonCompliant += 1;
      } else if (effectiveStatus === 'WARNING') {
        warnings += 1;
      }
    }

    const topTools = Array.from(toolCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    const topCategories = Array.from(categoryCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);
    const activityStats = Array.from(activityCounts.entries())
      .map(([nodeId, count]) => ({
        section: getTopLevelSectionsForSelections([nodeId])[0] ?? null,
        nodeId,
        label: usageNodeLabelMap.get(nodeId) ?? nodeId,
        count,
      }))
      .sort((a, b) => b.count - a.count);
    const topNonCompliantActivities = Array.from(nonCompliantActivityCounts.entries())
      .map(([nodeId, count]) => ({
        section: getTopLevelSectionsForSelections([nodeId])[0] ?? null,
        nodeId,
        label: usageNodeLabelMap.get(nodeId) ?? nodeId,
        count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
    const maxToolCount = topTools[0]?.count ?? 1;
    const maxCategoryCount = topCategories[0]?.count ?? 1;
    const maxActivityCount = activityStats[0]?.count ?? 1;
    const maxNonCompliantActivityCount = topNonCompliantActivities[0]?.count ?? 1;

    return {
      total: logs.length,
      nonCompliant,
      warnings,
      topTools,
      topCategories,
      maxToolCount,
      maxCategoryCount,
      unspecifiedToolCount,
      uncategorizedRootCount,
      activityStats,
      maxActivityCount,
      topNonCompliantActivities,
      maxNonCompliantActivityCount,
    };
  }, [logs, usageNodeLabelMap]);

  if (logsQuery.isLoading) {
    return <p className="text-sm text-slate-700">Loading your logs...</p>;
  }

  if (logsQuery.isError) {
    return <p className="text-sm text-red-700">Failed to load your logs.</p>;
  }

  if (logs.length === 0) {
    return <p className="text-sm text-slate-700">No logs yet.</p>;
  }

  return (
    <div className="space-y-3">
      <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <article className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Total Logs</p>
          <p className="mt-1 text-xl font-semibold text-slate-900">{stats.total}</p>
        </article>
        <article className="rounded-lg border border-amber-300 bg-amber-50 p-3">
          <p className="text-xs uppercase tracking-wide text-amber-700">Warnings</p>
          <p className="mt-1 text-xl font-semibold text-amber-900">{stats.warnings}</p>
        </article>
        <article className="rounded-lg border border-red-300 bg-red-50 p-3">
          <p className="text-xs uppercase tracking-wide text-red-700">Non-Compliant</p>
          <p className="mt-1 text-xl font-semibold text-red-900">{stats.nonCompliant}</p>
        </article>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-cyan-50/40 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-slate-900">Your AI Usage Patterns</p>
          <div className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            Analytics view
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          <article className="rounded-lg border border-slate-200 bg-white/80 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Top Tools</p>
            {stats.topTools.length === 0 ? (
              <p className="mt-2 text-xs text-slate-600">No named tools yet.</p>
            ) : (
              <div className="mt-2 space-y-2">
                {stats.topTools.map((item) => (
                  <div key={item.name} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-800">{item.name}</span>
                      <span className="font-semibold text-slate-600">{item.count}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-200">
                      <div
                        className="h-1.5 rounded-full bg-slate-700"
                        style={{ width: `${(item.count / stats.maxToolCount) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {stats.unspecifiedToolCount > 0 ? (
              <p className="mt-2 text-[11px] text-slate-500">
                Unspecified tools: {stats.unspecifiedToolCount}
              </p>
            ) : null}
          </article>

          <article className="rounded-lg border border-slate-200 bg-white/80 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Top Categories</p>
            {stats.topCategories.length === 0 ? (
              <p className="mt-2 text-xs text-slate-600">No categories yet.</p>
            ) : (
              <div className="mt-2 space-y-2">
                {stats.topCategories.map((item) => (
                  <div key={item.name} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-800">{item.name}</span>
                      <span className="font-semibold text-slate-600">{item.count}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-200">
                      <div
                        className="h-1.5 rounded-full bg-cyan-700"
                        style={{ width: `${(item.count / stats.maxCategoryCount) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {stats.uncategorizedRootCount > 0 ? (
              <p className="mt-2 text-[11px] text-slate-500">
                Uncategorized: {stats.uncategorizedRootCount}
              </p>
            ) : null}
          </article>

          <article className="rounded-lg border border-slate-200 bg-white/80 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Activity Breakdown</p>
            {stats.activityStats.length === 0 ? (
              <p className="mt-2 text-xs text-slate-600">No activity data yet.</p>
            ) : (
              <div className="mt-2 space-y-2">
                {stats.activityStats.slice(0, 8).map((activity) => (
                  <div key={activity.nodeId} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="inline-flex items-center gap-1.5 font-medium text-slate-800">
                        <span
                          className={`inline-block h-2 w-2 rounded-full ${
                            rootTypeColor(activity.section?.id ?? '').dotClass
                          }`}
                        />
                        <span>{activity.label}</span>
                        <span
                          className={`text-[10px] font-semibold uppercase tracking-wide ${
                            rootTypeColor(activity.section?.id ?? '').labelClass
                          }`}
                        >
                          {activity.section?.label ?? 'Other'}
                        </span>
                      </span>
                      <span className="font-semibold text-slate-600">{activity.count}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-200">
                      <div
                        className={`h-1.5 rounded-full ${
                          rootTypeColor(activity.section?.id ?? '').barClass
                        }`}
                        style={{ width: `${(activity.count / stats.maxActivityCount) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </article>
        </div>

        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/50 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-800">
            Top Conflicting Categories
          </p>
          {stats.topNonCompliantActivities.length === 0 ? (
            <p className="mt-2 text-xs text-amber-800/80">No flagged activity selected.</p>
          ) : (
            <div className="mt-2 space-y-2">
              <div className="flex h-5 w-full overflow-hidden rounded-full bg-amber-100">
                {(() => {
                  const total = stats.topNonCompliantActivities.reduce((sum, a) => sum + a.count, 0);
                  return stats.topNonCompliantActivities.map((activity) => {
                    const pct = (activity.count / total) * 100;
                    return (
                      <div
                        key={activity.nodeId}
                        className={`h-full ${rootTypeColor(activity.section?.id ?? '').barClass}`}
                        style={{ width: `${pct}%` }}
                        title={`${activity.label}: ${Math.round(pct)}%`}
                      />
                    );
                  });
                })()}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {(() => {
                  const total = stats.topNonCompliantActivities.reduce((sum, a) => sum + a.count, 0);
                  return stats.topNonCompliantActivities.map((activity) => {
                    const pct = Math.round((activity.count / total) * 100);
                    return (
                      <span key={activity.nodeId} className="inline-flex items-center gap-1.5 text-xs">
                        <span
                          className={`inline-block h-2 w-2 rounded-full ${
                            rootTypeColor(activity.section?.id ?? '').dotClass
                          }`}
                        />
                        <span className="font-medium text-slate-800">{activity.label}</span>
                        <span className="font-semibold text-amber-800">{pct}%</span>
                      </span>
                    );
                  });
                })()}
              </div>
            </div>
          )}
        </div>
      </section>

      {logs.map((log) => {
        const effectiveComplianceStatus = getEffectiveComplianceStatus(log);
        const hasConflict = effectiveComplianceStatus === 'NON_COMPLIANT';
        return (
          <article
            key={log.id}
            className={`rounded-lg border p-3 ${
              effectiveComplianceStatus === 'NON_COMPLIANT'
                ? 'border-red-300 bg-red-50'
                : effectiveComplianceStatus === 'WARNING'
                  ? 'border-amber-300 bg-amber-50'
                : 'border-slate-200 bg-[var(--surface-muted)]'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-left text-sm font-semibold text-[var(--brand)]">
                {log.courseCode} - {log.assignmentTitle}
              </p>
              <p className="text-xs text-slate-600">
                {new Date(log.createdAt).toLocaleString()}
              </p>
            </div>
            {hasConflict ? (
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-red-700">
                Conflict
              </p>
            ) : null}
            <p className="mt-1 text-xs text-slate-600">
              Source: New Log • {log.courseName}
            </p>
            <p className="mt-1 text-xs text-slate-700">AI Tool: {log.aiTool || 'Not set'}</p>
            <p className="mt-2 text-sm text-slate-800">
              {log.usageReason || 'No reason recorded.'}
            </p>
            <div className="mt-3 flex items-center justify-between">
              <p className="text-xs text-slate-600">
                Comment: {log.sessionDescription?.trim() ? 'Present' : 'None'}
              </p>
              <Link
                href={`/log?logId=${encodeURIComponent(log.id)}`}
                className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white"
              >
                Edit in New Log
              </Link>
            </div>
          </article>
        );
      })}
    </div>
  );
}
