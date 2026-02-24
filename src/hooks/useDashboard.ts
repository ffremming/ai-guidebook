'use client';

import { useQuery } from '@tanstack/react-query';

export type DashboardActionItem = {
  logId: string;
  assignmentTitle: string;
  flagSeverity: string | null;
  resolveUrl: string;
};

export type DashboardAssignmentStatus = {
  assignmentId: string;
  assignmentTitle: string;
  status: 'READY' | 'PENDING';
  pendingCount: number;
};

export type DashboardUsageHistoryEntry = {
  id: string;
  usageReason: string;
  userStatedIntent: string | null;
  systemClassification: string | null;
  complianceStatus: 'PENDING' | 'COMPLIANT' | 'WARNING' | 'NON_COMPLIANT';
  resolutionStatus: 'NONE' | 'UNRESOLVED' | 'STUDENT_RESPONDED';
  createdAt: string;
};

export type DashboardResponse = {
  actionItems: DashboardActionItem[];
  assignmentStatuses: DashboardAssignmentStatus[];
  recentLogs: DashboardUsageHistoryEntry[];
  unreadNotificationCount: number;
};

async function fetchDashboard(): Promise<DashboardResponse> {
  const response = await fetch('/api/dashboard', {
    method: 'GET',
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('Failed to load dashboard');
  }

  return (await response.json()) as DashboardResponse;
}

export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: fetchDashboard,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
}
