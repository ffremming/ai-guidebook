'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { useRouter } from 'next/navigation';

import { useComplianceCheck } from '@/hooks/useComplianceCheck';
import {
  getTopLevelSectionsForSelections,
  getUsageNodeIdPath,
  getUsageTreeRootNodes,
} from '@/lib/usage-taxonomy';
import { createLogSchema, type CreateLogInput } from '@/lib/validations/log.schema';

import { AssignmentSelector } from './assignment-selector';
import { CompliancePreviewPanel } from './compliance-preview-panel';
import { CourseSelector } from './course-selector';
import { UsageTaxonomySelector } from './usage-taxonomy-selector';

type AssignmentItem = {
  id: string;
  courseId: string;
  title: string;
  assignmentCode: string;
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

type LogDetailResponse = {
  id: string;
  assignmentId: string;
  assignmentCourseId: string;
  complianceStatus: 'PENDING' | 'COMPLIANT' | 'WARNING' | 'NON_COMPLIANT';
  usageSubsections: string[];
  usageReason: string;
  sessionDescription: string | null;
  aiTool: string;
  conversationLinks: Array<{
    usageNodeId: string | null;
    text: string | null;
  }>;
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

type ReflectionNoteResponse = {
  note: {
    id: string;
    content: string;
    createdAt: string;
  };
};

export type ManualLogFormValues = CreateLogInput;

type ValidationErrorPayload = {
  error: string;
  fields?: Record<string, string[]>;
};

const COMPLIANCE_JUSTIFICATION_HEADER = 'Compliance break justification:';
const COMPLIANCE_JUSTIFICATION_END_MARKER = '\n\n[End Compliance Justification]\n\n';

function parseComplianceJustification(sessionDescription: string | null): {
  justification: string;
  sessionDescription: string;
} {
  const normalized = (sessionDescription ?? '').replace(/\r\n/g, '\n').trim();
  const prefix = `${COMPLIANCE_JUSTIFICATION_HEADER}\n`;
  if (!normalized.startsWith(prefix)) {
    return {
      justification: '',
      sessionDescription: normalized,
    };
  }

  const rest = normalized.slice(prefix.length);
  const markerIndex = rest.indexOf(COMPLIANCE_JUSTIFICATION_END_MARKER);
  if (markerIndex === -1) {
    return {
      justification: rest.trim(),
      sessionDescription: '',
    };
  }

  return {
    justification: rest.slice(0, markerIndex).trim(),
    sessionDescription: rest
      .slice(markerIndex + COMPLIANCE_JUSTIFICATION_END_MARKER.length)
      .trim(),
  };
}

function composeSessionDescriptionWithJustification(
  sessionDescription: string,
  complianceJustification: string,
): string {
  const trimmedJustification = complianceJustification.trim();
  const trimmedSessionDescription = sessionDescription.trim();
  if (!trimmedJustification) {
    return trimmedSessionDescription;
  }

  return `${COMPLIANCE_JUSTIFICATION_HEADER}
${trimmedJustification}${COMPLIANCE_JUSTIFICATION_END_MARKER}${trimmedSessionDescription}`.trim();
}

async function fetchAssignments(): Promise<AssignmentsResponse> {
  const response = await fetch('/api/assignments', { method: 'GET', cache: 'no-store' });
  if (!response.ok) {
    throw new Error('Failed to load assignments');
  }
  return (await response.json()) as AssignmentsResponse;
}

async function submitLog(payload: CreateLogInput) {
  const response = await fetch('/api/logs', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorPayload = (await response.json()) as ValidationErrorPayload;
    throw errorPayload;
  }

  return response.json();
}

async function updateLog(logId: string, payload: CreateLogInput) {
  const response = await fetch(`/api/logs/${logId}`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorPayload = (await response.json()) as ValidationErrorPayload;
    throw errorPayload;
  }

  return response.json();
}

async function fetchLogById(logId: string): Promise<LogDetailResponse> {
  const response = await fetch(`/api/logs/${logId}`, {
    method: 'GET',
    cache: 'no-store',
  });

  if (!response.ok) {
    const errorPayload = (await response.json()) as ValidationErrorPayload;
    throw errorPayload;
  }

  return (await response.json()) as LogDetailResponse;
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

async function createReflectionNote(payload: {
  content: string;
}): Promise<ReflectionNoteResponse> {
  const response = await fetch('/api/reflection-notes', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorPayload = (await response.json()) as ValidationErrorPayload;
    throw errorPayload;
  }

  return (await response.json()) as ReflectionNoteResponse;
}

function SectionCard({
  step,
  title,
  description,
  children,
}: {
  step: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
        Step {step}
      </p>
      <h2 className="mt-1 text-lg font-semibold text-slate-900">{title}</h2>
      <p className="mt-1 text-sm text-slate-600">{description}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function ManualLogForm({
  initialLogId = null,
  initialAssignmentId = null,
}: {
  initialLogId?: string | null;
  initialAssignmentId?: string | null;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const editingLogId = initialLogId;
  const isEditMode = Boolean(editingLogId);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [selectedCourseIdOverride, setSelectedCourseIdOverride] = useState<string | null>(null);
  const [integratedComment, setIntegratedComment] = useState<string | null>(null);
  const [complianceJustificationInput, setComplianceJustificationInput] = useState<string | null>(null);
  const [complianceJustificationTouched, setComplianceJustificationTouched] = useState(false);
  const [confirmedOwnership, setConfirmedOwnership] = useState(false);
  const [reflectionModalOpen, setReflectionModalOpen] = useState(false);
  const [reflectionModalNodeId, setReflectionModalNodeId] = useState<string | null>(null);
  const [reflectionModalText, setReflectionModalText] = useState('');
  const [reflectionModalError, setReflectionModalError] = useState<string | null>(null);

  const assignmentsQuery = useQuery({
    queryKey: ['assignments'],
    queryFn: fetchAssignments,
  });
  const editingLogQuery = useQuery({
    queryKey: ['log-detail', editingLogId],
    queryFn: () => fetchLogById(editingLogId as string),
    enabled: Boolean(editingLogId),
    refetchOnWindowFocus: false,
  });

  const form = useForm<ManualLogFormValues>({
    resolver: zodResolver(createLogSchema),
    defaultValues: {
      assignmentId: '',
      usageSubsections: [],
      usageEvidence: [],
      usageReason: '',
      sessionDescription: '',
      aiTool: '',
    },
    mode: 'onSubmit',
  });

  const evidenceFieldArray = useFieldArray({
    control: form.control,
    name: 'usageEvidence',
  });

  const courses = useMemo(() => {
    const assignments = assignmentsQuery.data?.assignments ?? [];
    const deduped = new Map<string, AssignmentItem['course']>();
    for (const assignment of assignments) {
      if (!deduped.has(assignment.course.id)) {
        deduped.set(assignment.course.id, assignment.course);
      }
    }
    return Array.from(deduped.values()).sort((a, b) => a.courseCode.localeCompare(b.courseCode));
  }, [assignmentsQuery.data]);

  const allAssignments = useMemo(
    () => assignmentsQuery.data?.assignments ?? [],
    [assignmentsQuery.data?.assignments],
  );

  const selectedAssignmentId = useWatch({
    control: form.control,
    name: 'assignmentId',
  });
  const usageReason = useWatch({
    control: form.control,
    name: 'usageReason',
  });
  const usageSubsectionsValue = useWatch({
    control: form.control,
    name: 'usageSubsections',
  });
  const usageEvidence = useWatch({
    control: form.control,
    name: 'usageEvidence',
  });

  const selectedCourseId =
    selectedCourseIdOverride ??
    allAssignments.find((assignment) => assignment.id === selectedAssignmentId)?.courseId ??
    null;
  const filteredAssignments = useMemo(() => {
    if (!selectedCourseId) {
      return [];
    }
    return allAssignments.filter((assignment) => assignment.courseId === selectedCourseId);
  }, [allAssignments, selectedCourseId]);
  const selectedCourse = courses.find((course) => course.id === selectedCourseId) ?? null;
  const selectedAssignment = allAssignments.find((assignment) => assignment.id === selectedAssignmentId) ?? null;
  const isContextComplete = Boolean(selectedCourseId && selectedAssignmentId);
  const selectedEvidenceCount = (usageEvidence ?? []).filter(
    (item) => item.text.trim().length > 0,
  ).length;

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
  const selectedRootLabels = useMemo(() => {
    if (!usageSubsectionsValue || usageSubsectionsValue.length === 0) {
      return [];
    }
    return getTopLevelSectionsForSelections(usageSubsectionsValue).map((section) => section.label);
  }, [usageSubsectionsValue]);
  const previewActivityItems = useMemo(() => {
    const selected = Array.from(new Set(usageSubsectionsValue ?? []));
    if (selected.length === 0) {
      return [];
    }

    const deepestOnly = selected.filter((nodeId) => {
      return !selected.some((otherId) => {
        if (otherId === nodeId) {
          return false;
        }
        return getUsageNodeIdPath(otherId).includes(nodeId);
      });
    });

    return deepestOnly.map((nodeId) => ({
      id: nodeId,
      label: usageNodeLabelMap.get(nodeId) ?? nodeId,
      rootLabel: getTopLevelSectionsForSelections([nodeId])[0]?.label ?? null,
    }));
  }, [usageNodeLabelMap, usageSubsectionsValue]);

  const complianceCheck = useComplianceCheck(
    usageReason,
    selectedAssignmentId ? selectedAssignmentId : null,
  );
  const assignmentUsageTreeQuery = useQuery({
    queryKey: ['assignment-usage-tree-for-form', selectedAssignmentId],
    queryFn: () => fetchAssignmentUsageTree(selectedAssignmentId as string),
    enabled: Boolean(selectedAssignmentId),
  });

  const selectedConflictNodeIds = useMemo(() => {
    const selectedNodeIds = usageSubsectionsValue ?? [];
    if (selectedNodeIds.length === 0) {
      return [];
    }

    const disallowedNodeIds = new Set<string>();
    const stack = [...(assignmentUsageTreeQuery.data?.tree ?? [])];
    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) {
        continue;
      }
      if (current.status === 'DISALLOWED') {
        disallowedNodeIds.add(current.id);
      }
      if (current.children && current.children.length > 0) {
        stack.push(...current.children);
      }
    }

    return selectedNodeIds.filter((nodeId) => disallowedNodeIds.has(nodeId));
  }, [usageSubsectionsValue, assignmentUsageTreeQuery.data?.tree]);
  const usageNodeStatusById = useMemo(() => {
    const result: Record<string, 'ALLOWED' | 'DISALLOWED' | 'MIXED'> = {};
    const stack = [...(assignmentUsageTreeQuery.data?.tree ?? [])];

    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) {
        continue;
      }
      result[current.id] = current.status;
      if (current.children && current.children.length > 0) {
        stack.push(...current.children);
      }
    }

    return Object.keys(result).length > 0 ? result : undefined;
  }, [assignmentUsageTreeQuery.data?.tree]);

  const completionChecks = useMemo(
    () => [
      {
        label: 'Course',
        done: Boolean(selectedCourseId),
      },
      { label: 'Assignment', done: Boolean(selectedAssignmentId) },
      {
        label: 'Activities',
        done: Boolean((usageSubsectionsValue?.length ?? 0) > 0),
      },
      {
        label: 'Justification',
        done:
          selectedConflictNodeIds.length === 0 ||
          (complianceJustificationInput ??
            parseComplianceJustification(editingLogQuery.data?.sessionDescription ?? '').justification)
            .trim().length > 0,
      },
      { label: 'Comment', done: true },
      { label: 'Ownership', done: isEditMode || confirmedOwnership },
    ],
    [
      selectedCourseId,
      selectedAssignmentId,
      usageSubsectionsValue,
      isEditMode,
      editingLogQuery.data?.sessionDescription,
      selectedConflictNodeIds,
      complianceJustificationInput,
      confirmedOwnership,
    ],
  );

  const completedCount = completionChecks.filter((check) => check.done).length;
  const readinessPercent = Math.round((completedCount / completionChecks.length) * 100);
  const currentIntegratedComment =
    integratedComment ?? (editingLogQuery.data?.usageReason ?? '');
  const prefilledComplianceJustification = useMemo(() => {
    if (!isEditMode || !editingLogQuery.data) {
      return '';
    }
    return parseComplianceJustification(
      editingLogQuery.data.sessionDescription ?? '',
    ).justification;
  }, [editingLogQuery.data, isEditMode]);
  const currentComplianceJustification =
    complianceJustificationInput ?? prefilledComplianceJustification;
  const requiresComplianceJustification = selectedConflictNodeIds.length > 0;
  const complianceJustificationError =
    requiresComplianceJustification &&
    complianceJustificationTouched &&
    currentComplianceJustification.trim().length === 0;

  const createLogMutation = useMutation({
    mutationFn: submitLog,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      router.push('/dashboard?toast=log-created');
    },
  });
  const updateLogMutation = useMutation({
    mutationFn: ({ logId, payload }: { logId: string; payload: CreateLogInput }) =>
      updateLog(logId, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      await queryClient.invalidateQueries({ queryKey: ['my-logs'] });
      router.push('/dashboard?toast=log-created');
    },
  });
  const createReflectionNoteMutation = useMutation({
    mutationFn: createReflectionNote,
  });

  useEffect(() => {
    if (!editingLogQuery.data) {
      return;
    }

    if (form.getValues('assignmentId')) {
      return;
    }

    const existing = editingLogQuery.data;
    const parsedSession = parseComplianceJustification(existing.sessionDescription ?? '');
    form.reset({
      assignmentId: existing.assignmentId,
      usageSubsections: existing.usageSubsections,
      usageReason: existing.usageReason,
      sessionDescription: parsedSession.sessionDescription,
      aiTool: existing.aiTool ?? '',
      usageEvidence: existing.conversationLinks
        .filter((item) => item.usageNodeId && item.text)
        .map((item) => ({
          nodeId: item.usageNodeId as string,
          text: item.text as string,
        })),
    });
  }, [editingLogQuery.data, form]);

  useEffect(() => {
    if (isEditMode || !initialAssignmentId) {
      return;
    }

    const assignment = allAssignments.find((item) => item.id === initialAssignmentId);
    if (!assignment) {
      return;
    }

    const currentAssignmentId = form.getValues('assignmentId');
    if (currentAssignmentId && currentAssignmentId !== initialAssignmentId) {
      return;
    }

    form.setValue('assignmentId', assignment.id, { shouldValidate: true });
  }, [allAssignments, form, initialAssignmentId, isEditMode]);

  async function onSubmit(values: ManualLogFormValues) {
    setSubmitError(null);
    form.clearErrors();
    setComplianceJustificationTouched(true);

    if (!isContextComplete) {
      setSubmitError('Complete the context section before submitting the log.');
      return;
    }

    if (
      requiresComplianceJustification &&
      currentComplianceJustification.trim().length === 0
    ) {
      setSubmitError('Add a justification for the compliance break before submitting.');
      return;
    }
    const sessionDescriptionValue = (values.sessionDescription ?? '').trim();
    const payload: ManualLogFormValues = {
      ...values,
      aiTool: values.aiTool.trim(),
      usageReason: currentIntegratedComment.trim(),
      sessionDescription: requiresComplianceJustification
        ? composeSessionDescriptionWithJustification(
            sessionDescriptionValue,
            currentComplianceJustification,
          )
        : sessionDescriptionValue,
    };

    if (!isEditMode && !confirmedOwnership) {
      setSubmitError('Confirm ownership before submitting.');
      return;
    }

    try {
      if (editingLogId) {
        await updateLogMutation.mutateAsync({
          logId: editingLogId,
          payload,
        });
      } else {
        await createLogMutation.mutateAsync(payload);
      }
    } catch (error) {
      const payload = error as ValidationErrorPayload;
      if (payload?.fields) {
        for (const [path, messages] of Object.entries(payload.fields)) {
          const message = messages[0];
          if (!message) {
            continue;
          }
          form.setError(path as never, {
            type: 'server',
            message,
          });
        }
      }
      setSubmitError(payload?.error ?? 'Unable to submit log');
    }
  }

  function onChangeIntegratedComment(nextText: string) {
    setIntegratedComment(nextText);
    form.setValue('usageReason', nextText, {
      shouldValidate: true,
      shouldDirty: true,
    });
  }

  async function submitDisallowedReflection() {
    setReflectionModalError(null);
    const nodeId = reflectionModalNodeId;
    const content = reflectionModalText.trim();

    if (!nodeId) {
      setReflectionModalError('No activity selected.');
      return;
    }
    if (content.length === 0) {
      setReflectionModalError('Write a reflection before submitting.');
      return;
    }

    try {
      const result = await createReflectionNoteMutation.mutateAsync({
        content,
      });

      const current = form.getValues('usageSubsections') ?? [];
      if (!current.includes(nodeId)) {
        form.setValue('usageSubsections', [...current, nodeId], { shouldValidate: true });
      }

      const prefix = `[${new Date(result.note.createdAt).toLocaleString()}] `;
      const line = `${prefix}${result.note.content}`.trim();
      setComplianceJustificationInput((previous) => {
        const currentText = (previous ?? prefilledComplianceJustification).trim();
        if (!currentText) {
          return line;
        }
        return `${currentText}\n\n${line}`;
      });
      setComplianceJustificationTouched(true);
      setReflectionModalText('');
      setReflectionModalNodeId(null);
      setReflectionModalOpen(false);
    } catch (error) {
      const payload = error as ValidationErrorPayload;
      setReflectionModalError(payload.error ?? 'Unable to store reflection');
    }
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-2xl border border-slate-200 bg-gradient-to-r from-white via-slate-50 to-white p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">New Log</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900 sm:text-3xl">
          {isEditMode ? 'Edit AI usage log' : 'Manual AI usage log'}
        </h1>
      </section>

      {assignmentsQuery.isLoading || editingLogQuery.isLoading ? (
        <p className="mt-6 text-sm text-slate-700">Loading assignments...</p>
      ) : null}
      {assignmentsQuery.isError || editingLogQuery.isError ? (
        <p className="mt-6 text-sm text-red-700">Failed to load assignments.</p>
      ) : null}

      {!assignmentsQuery.isLoading &&
      !assignmentsQuery.isError &&
      !editingLogQuery.isLoading &&
      !editingLogQuery.isError ? (
        <>
          {reflectionModalOpen ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
              <div className="w-full max-w-xl rounded-xl border border-slate-200 bg-white p-5 shadow-lg">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Required Reflection
                </p>
                <h3 className="mt-1 text-lg font-semibold text-slate-900">
                  Disallowed activity selected
                </h3>
                <p className="mt-2 text-sm text-slate-700">
                  Write a short reflection before this activity can be selected.
                </p>
                <textarea
                  rows={6}
                  value={reflectionModalText}
                  onChange={(event) => setReflectionModalText(event.target.value)}
                  className="mt-3 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                  placeholder="Why are you using this disallowed activity in this context?"
                />
                {reflectionModalError ? (
                  <p className="mt-2 text-sm text-red-700">{reflectionModalError}</p>
                ) : null}
                <div className="mt-4 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setReflectionModalOpen(false);
                      setReflectionModalNodeId(null);
                      setReflectionModalText('');
                      setReflectionModalError(null);
                    }}
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700"
                    disabled={createReflectionNoteMutation.isPending}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void submitDisallowedReflection()}
                    className="rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                    disabled={createReflectionNoteMutation.isPending}
                  >
                    {createReflectionNoteMutation.isPending ? 'Submitting...' : 'Submit reflection'}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          <form onSubmit={form.handleSubmit(onSubmit)} className="mt-6 grid gap-6 lg:grid-cols-3" noValidate>
          <div className="space-y-5 lg:col-span-2">
            {submitError ? (
              <section className="rounded-md border border-red-200 bg-red-50 p-3" role="alert">
                <p className="text-sm font-medium text-red-800">{submitError}</p>
              </section>
            ) : null}

            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="space-y-4">
                <CourseSelector
                  courses={courses}
                  selectedCourseId={selectedCourseId}
                  onSelect={(courseId) => {
                    setSelectedCourseIdOverride(courseId);
                    form.setValue('assignmentId', '');
                  }}
                />

                <AssignmentSelector
                  assignments={filteredAssignments}
                  value={selectedAssignmentId}
                  disabled={!selectedCourseId}
                  error={form.formState.errors.assignmentId?.message}
                  onChange={(value) => form.setValue('assignmentId', value, { shouldValidate: true })}
                />
              </div>
            </section>

            {isContextComplete ? (
              <SectionCard
                step="2"
                title="Usage"
                description="Tag activities and add your comment."
              >
                <div className="space-y-5">
                  {assignmentUsageTreeQuery.isLoading ? (
                    <p className="text-xs text-slate-600">
                      Loading activity rules...
                    </p>
                  ) : assignmentUsageTreeQuery.isError ? (
                    <p className="text-xs text-amber-700">
                      Could not load rule badges.
                    </p>
                  ) : null}
                  <UsageTaxonomySelector
                    value={{
                      usageSubsections: usageSubsectionsValue ?? [],
                      usageEvidence: usageEvidence ?? [],
                    }}
                    errors={{
                      usageSubsections: form.formState.errors.usageSubsections?.message,
                    }}
                    nodeStatusById={usageNodeStatusById}
                    conflictNodeIds={selectedConflictNodeIds}
                    onSubsectionToggle={(subsectionId, checked) => {
                      if (checked && usageNodeStatusById?.[subsectionId] === 'DISALLOWED') {
                        setReflectionModalError(null);
                        setReflectionModalNodeId(subsectionId);
                        setReflectionModalText('');
                        setReflectionModalOpen(true);
                        return;
                      }

                      const current = form.getValues('usageSubsections') ?? [];
                      const next = checked
                        ? Array.from(new Set([...current, subsectionId]))
                        : current.filter((value) => value !== subsectionId);
                      form.setValue('usageSubsections', next, { shouldValidate: true });

                      if (!checked) {
                        const existingEvidence = form.getValues('usageEvidence') ?? [];
                        const filteredEvidence = existingEvidence.filter((item) => item.nodeId !== subsectionId);
                        form.setValue('usageEvidence', filteredEvidence, { shouldValidate: true });
                      }
                    }}
                    onAddEvidence={(nodeId) => {
                      evidenceFieldArray.append({
                        nodeId,
                        text: '',
                      });
                    }}
                    onRemoveEvidence={(index) => {
                      evidenceFieldArray.remove(index);
                    }}
                    onUpdateEvidence={(index, patch) => {
                      const current = form.getValues(`usageEvidence.${index}`);
                      if (!current) {
                        return;
                      }
                      evidenceFieldArray.update(index, {
                        ...current,
                        ...patch,
                      });
                    }}
                  />

                  <div className="h-px bg-slate-200" />

                  <div className="space-y-4">
                    {requiresComplianceJustification ? (
                      <div
                        className={`space-y-2 rounded-xl border p-4 ${
                          complianceJustificationError
                            ? 'border-red-300 bg-red-50'
                            : 'border-amber-300 bg-amber-50'
                        }`}
                      >
                        <label
                          htmlFor="compliance-justification"
                          className="block text-sm font-semibold text-slate-900"
                        >
                          Justify the rule/compliance break
                        </label>
                        <p className="text-xs text-slate-700">
                          Required for disallowed selections.
                        </p>
                        <textarea
                          id="compliance-justification"
                          rows={4}
                          value={currentComplianceJustification}
                          onChange={(event) => {
                            setComplianceJustificationInput(event.target.value);
                            setComplianceJustificationTouched(true);
                          }}
                          onBlur={() => setComplianceJustificationTouched(true)}
                          placeholder="Explain why this break occurred and what corrective steps were taken."
                          className={`w-full rounded-lg bg-white px-3 py-2 text-sm text-slate-900 ${
                            complianceJustificationError
                              ? 'border border-red-400'
                              : 'border border-slate-300'
                          }`}
                        />
                        {complianceJustificationError ? (
                          <p className="text-sm font-medium text-red-700">
                            This field is required.
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                    <div className="space-y-2 rounded-xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-4">
                      <textarea
                        id="integrated-comment"
                        rows={8}
                        value={currentIntegratedComment}
                        onChange={(event) => onChangeIntegratedComment(event.target.value)}
                        placeholder="Write a short summary of your AI usage for this assignment."
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-3 font-mono text-sm text-slate-900 shadow-inner"
                      />
                      {form.formState.errors.aiTool?.message ? (
                        <p className="text-sm text-red-700">{form.formState.errors.aiTool.message}</p>
                      ) : null}
                      {form.formState.errors.usageReason?.message ? (
                        <p className="text-sm text-red-700">{form.formState.errors.usageReason.message}</p>
                      ) : null}
                      {form.formState.errors.sessionDescription?.message ? (
                        <p className="text-sm text-red-700">
                          {form.formState.errors.sessionDescription.message}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              </SectionCard>
            ) : null}

            {isContextComplete && !isEditMode ? (
              <SectionCard
                step="3"
                title="Final Review"
                description="Confirm and submit."
              >
                <div className="space-y-3">
                <label className="flex items-start gap-3 rounded-md border border-slate-200 bg-slate-50 p-3">
                  <input
                    type="checkbox"
                    checked={confirmedOwnership}
                    onChange={(event) => setConfirmedOwnership(event.target.checked)}
                    className="mt-0.5"
                  />
                  <span className="text-sm text-slate-800">
                    I confirm the final submitted work remains my own and this log accurately represents AI support.
                  </span>
                </label>
                </div>
              </SectionCard>
            ) : null}
          </div>

          <aside className="space-y-4 lg:sticky lg:top-4 lg:h-fit">
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Progress</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">{readinessPercent}%</p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-slate-900 transition-all"
                  style={{ width: `${readinessPercent}%` }}
                />
              </div>
              <ul className="mt-3 space-y-2 text-sm">
                {completionChecks.map((check) => (
                  <li key={check.label} className="flex items-center gap-2 text-slate-700">
                    <span
                      className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs ${
                        check.done ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {check.done ? '✓' : '•'}
                    </span>
                    <span>{check.label}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Preview</p>

              <div className="mt-3 space-y-3 text-sm text-slate-800">
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Context</p>
                  <p className="mt-1 font-medium text-slate-900">
                    {selectedCourse ? `${selectedCourse.courseCode}` : 'No course selected'}
                    {selectedAssignment ? ` • ${selectedAssignment.title}` : ''}
                  </p>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Tags</p>
                  {selectedRootLabels.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {selectedRootLabels.map((label) => (
                        <span
                          key={label}
                          className="rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700"
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Activities</p>
                  {previewActivityItems.length > 0 ? (
                    <ul className="mt-2 space-y-1 text-xs text-slate-700">
                      {previewActivityItems.map((item) => (
                        <li key={item.id} className="truncate">
                          {item.label}
                          {item.rootLabel ? ` (${item.rootLabel})` : ''}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Evidence</p>
                  <p className="mt-1 text-slate-700">{selectedEvidenceCount} item(s) attached</p>
                </div>
              </div>
            </section>

            {isContextComplete ? (
              <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <CompliancePreviewPanel
                  isLoading={complianceCheck.isLoading}
                  status={complianceCheck.result?.status ?? null}
                  message={complianceCheck.result?.message ?? complianceCheck.error}
                  detectedCategory={complianceCheck.result?.detectedCategory ?? null}
                  ruleReferences={complianceCheck.result?.ruleReferences ?? []}
                />
              </section>
            ) : (
              <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Compliance Preview</p>
                <p className="mt-2 text-sm text-slate-700">Complete context first.</p>
              </section>
            )}

            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <button
                type="submit"
                disabled={createLogMutation.isPending || updateLogMutation.isPending}
                className="w-full rounded-md bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {createLogMutation.isPending || updateLogMutation.isPending
                  ? 'Submitting...'
                  : isEditMode
                    ? 'Save log'
                    : 'Submit log'}
              </button>
            </div>
          </aside>
          </form>
        </>
      ) : null}
    </main>
  );
}
