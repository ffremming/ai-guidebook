'use client';

import { useQuery } from '@tanstack/react-query';

export type StaffDashboardResponse = {
  summary: {
    totalLogs: number;
    nonCompliantLogs: number;
    warningLogs: number;
    studentsWithLogs: number;
  };
  studentPatterns: Array<{
    studentId: string;
    studentName: string;
    studentEmail: string;
    totalLogs: number;
    nonCompliantCount: number;
    warningCount: number;
    topTools: Array<{ name: string; count: number }>;
    topCategories: Array<{ name: string; count: number }>;
    lastLogAt: string | null;
  }>;
  alerts: Array<{
    logId: string;
    studentId: string;
    studentName: string;
    studentEmail: string;
    assignmentTitle: string;
    courseCode: string;
    complianceStatus: 'WARNING' | 'NON_COMPLIANT';
    createdAt: string;
    reasonSnippet: string;
    resolveUrl: string;
  }>;
};

async function fetchStaffDashboard(): Promise<StaffDashboardResponse> {
  const response = await fetch('/api/staff/dashboard', {
    method: 'GET',
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('Failed to load staff dashboard');
  }

  return (await response.json()) as StaffDashboardResponse;
}

export function useStaffDashboard() {
  return useQuery({
    queryKey: ['staff-dashboard'],
    queryFn: fetchStaffDashboard,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
}
