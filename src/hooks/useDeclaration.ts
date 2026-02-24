'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

type DeclarationResponse = {
  id: string;
  assignmentId: string;
  userId: string;
  systemSummary: string;
  studentRemarks: string | null;
  status: 'DRAFT' | 'EXPORTED';
  exportedAt: string | null;
  policyVersion: {
    versionNumber: string;
    publishedAt: string | null;
  };
};

type LogListResponse = {
  logs: Array<{
    id: string;
    assignmentId: string;
    complianceStatus: 'PENDING' | 'COMPLIANT' | 'WARNING' | 'NON_COMPLIANT';
    intentCategory: string | null;
    actualUsageCategory: string | null;
    conflictFlag: boolean;
    directViolationFlag: boolean;
    flagSeverity: string | null;
  }>;
};

type LogDetailResponse = {
  complianceChecks: Array<{
    ruleReferences: string[];
  }>;
};

type ResolutionResponse = {
  resolution: {
    id: string;
    aiLogId: string;
    narrativeExplanation: string;
    disputedCategory: string | null;
    disputeEvidence: string | null;
    originalSystemCategory: string;
    submittedAt: string;
  } | null;
};

export type DeclarationFlagItem = {
  logId: string;
  complianceStatus: 'PENDING' | 'COMPLIANT' | 'WARNING' | 'NON_COMPLIANT';
  userStatedIntent: string | null;
  systemClassification: string | null;
  conflictFlag: boolean;
  directViolationFlag: boolean;
  flagSeverity: string | null;
  ruleReference: string;
  resolution: ResolutionResponse['resolution'];
};

export type DeclarationData = {
  declaration: DeclarationResponse;
  flags: DeclarationFlagItem[];
};

export type DeclarationExportResponse = {
  systemSummary: string;
  studentRemarks: string | null;
  policyVersionNumber: string;
  logs: Array<{
    id: string;
    aiTool: string;
    usageSection: string | null;
    usageSubsection: string | null;
    usageSubsections: string[];
    usageTaxonomyVersion: string | null;
    usageReason: string | null;
    sessionDescription: string | null;
    intentCategory: string | null;
    actualUsageCategory: string | null;
    complianceStatus: string;
    resolutionStatus: string;
    createdAt: string;
    conversationLinks: Array<{
      id: string;
      usageNodeId: string | null;
      evidenceType: string | null;
      url: string | null;
      comment: string | null;
      label: string | null;
    }>;
  }>;
  flags: Array<{
    logId: string;
    conflictFlag: boolean;
    directViolationFlag: boolean;
    flagSeverity: string | null;
    complianceStatus: string;
  }>;
  resolutions: Array<{
    id: string;
    logId: string;
    narrativeExplanation: string;
    disputedCategory: string | null;
    disputeEvidence: string | null;
    originalSystemCategory: string;
    submittedAt: string;
  }>;
  exportedAt: string | null;
};

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

async function fetchDeclarationData(assignmentId: string): Promise<DeclarationData> {
  const [declaration, logsPayload] = await Promise.all([
    fetchJson<DeclarationResponse>(`/api/declarations/${assignmentId}`),
    fetchJson<LogListResponse>('/api/logs'),
  ]);

  const assignmentLogs = logsPayload.logs.filter((log) => log.assignmentId === assignmentId);
  const flaggedLogs = assignmentLogs.filter((log) => log.conflictFlag || log.directViolationFlag);

  const flags = await Promise.all(
    flaggedLogs.map(async (log) => {
      const [logDetail, resolutionPayload] = await Promise.all([
        fetchJson<LogDetailResponse>(`/api/logs/${log.id}`),
        fetchJson<ResolutionResponse>(`/api/resolutions/${log.id}`),
      ]);

      const firstReference =
        logDetail.complianceChecks.flatMap((check) => check.ruleReferences)[0] ?? 'N/A';

      return {
        logId: log.id,
        complianceStatus: log.complianceStatus,
        userStatedIntent: log.intentCategory,
        systemClassification: log.actualUsageCategory,
        conflictFlag: log.conflictFlag,
        directViolationFlag: log.directViolationFlag,
        flagSeverity: log.flagSeverity,
        ruleReference: firstReference,
        resolution: resolutionPayload.resolution,
      } satisfies DeclarationFlagItem;
    }),
  );

  return { declaration, flags };
}

export function useDeclaration(assignmentId: string) {
  const queryClient = useQueryClient();
  const queryKey = ['declaration', assignmentId] as const;

  const query = useQuery({
    queryKey,
    queryFn: () => fetchDeclarationData(assignmentId),
  });

  const saveRemarksMutation = useMutation({
    mutationFn: async (studentRemarks: string) =>
      fetchJson<DeclarationResponse>(`/api/declarations/${assignmentId}`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ studentRemarks }),
      }),
    onSuccess: (updatedDeclaration) => {
      queryClient.setQueryData<DeclarationData>(queryKey, (previous) => {
        if (!previous) {
          return previous;
        }

        return {
          ...previous,
          declaration: {
            ...previous.declaration,
            ...updatedDeclaration,
          },
        };
      });
    },
  });

  const exportMutation = useMutation({
    mutationFn: () =>
      fetchJson<DeclarationExportResponse>(`/api/declarations/${assignmentId}/export`, {
        method: 'POST',
      }),
    onSuccess: (exported) => {
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.setQueryData<DeclarationData>(queryKey, (previous) => {
        if (!previous) {
          return previous;
        }

        return {
          ...previous,
          declaration: {
            ...previous.declaration,
            status: 'EXPORTED',
            exportedAt: exported.exportedAt,
          },
        };
      });
    },
  });

  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    saveRemarks: saveRemarksMutation.mutateAsync,
    isSavingRemarks: saveRemarksMutation.isPending,
    exportDeclaration: exportMutation.mutateAsync,
    isExporting: exportMutation.isPending,
  };
}
