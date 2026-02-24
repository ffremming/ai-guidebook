'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';

type AssignmentItem = {
  id: string;
  courseId: string;
  title: string;
  assignmentCode: string;
  dueDate: string | null;
  status: 'ACTIVE' | 'CLOSED';
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

type CourseSearchItem = {
  id: string;
  courseCode: string;
  name: string;
  institution: string;
  assignmentCount: number;
  isEnrolled: boolean;
};

type CourseSearchResponse = {
  courses: CourseSearchItem[];
};

async function fetchAssignments(): Promise<AssignmentsResponse> {
  const response = await fetch('/api/assignments', {
    method: 'GET',
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('Failed to load subjects');
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

async function fetchCourseSearch(search: string): Promise<CourseSearchResponse> {
  const response = await fetch(`/api/courses?search=${encodeURIComponent(search)}`, {
    method: 'GET',
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('Failed to search subjects');
  }

  return (await response.json()) as CourseSearchResponse;
}

async function addSubject(courseId: string): Promise<void> {
  const response = await fetch('/api/courses', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ courseId }),
  });

  if (!response.ok) {
    throw new Error('Failed to add subject');
  }
}

export function SubjectsPage() {
  const queryClient = useQueryClient();
  const [expandedSubjectId, setExpandedSubjectId] = useState<string | null>(null);
  const [subjectSearch, setSubjectSearch] = useState('');
  const assignmentsQuery = useQuery({
    queryKey: ['subjects-page-assignments'],
    queryFn: fetchAssignments,
  });
  const logsQuery = useQuery({
    queryKey: ['subjects-page-logs'],
    queryFn: fetchLogs,
  });
  const subjectSearchQuery = useQuery({
    queryKey: ['subject-search', subjectSearch],
    queryFn: () => fetchCourseSearch(subjectSearch),
    enabled: subjectSearch.trim().length >= 2,
  });
  const addSubjectMutation = useMutation({
    mutationFn: addSubject,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['subjects-page-assignments'] });
      await queryClient.invalidateQueries({ queryKey: ['assignments'] });
      await queryClient.invalidateQueries({ queryKey: ['subject-search'] });
      setSubjectSearch('');
    },
  });

  const subjects = useMemo(() => {
    const map = new Map<
      string,
      {
        id: string;
        courseCode: string;
        name: string;
        institution: string;
        assignmentCount: number;
        activeCount: number;
        assignments: AssignmentItem[];
      }
    >();

    for (const assignment of assignmentsQuery.data?.assignments ?? []) {
      const current = map.get(assignment.course.id);
      if (!current) {
        map.set(assignment.course.id, {
          id: assignment.course.id,
          courseCode: assignment.course.courseCode,
          name: assignment.course.name,
          institution: assignment.course.institution,
          assignmentCount: 1,
          activeCount: assignment.status === 'ACTIVE' ? 1 : 0,
          assignments: [assignment],
        });
        continue;
      }

      current.assignmentCount += 1;
      if (assignment.status === 'ACTIVE') {
        current.activeCount += 1;
      }
      current.assignments.push(assignment);
    }

    return Array.from(map.values())
      .map((subject) => ({
        ...subject,
        assignments: subject.assignments.sort((a, b) => a.title.localeCompare(b.title)),
      }))
      .sort((a, b) => a.courseCode.localeCompare(b.courseCode));
  }, [assignmentsQuery.data?.assignments]);

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
  const expandedSubject = useMemo(
    () => subjects.find((subject) => subject.id === expandedSubjectId) ?? null,
    [expandedSubjectId, subjects],
  );

  if (assignmentsQuery.isLoading || logsQuery.isLoading) {
    return <p className="px-2 py-4 text-sm text-slate-700">Loading subjects...</p>;
  }

  if (assignmentsQuery.isError || logsQuery.isError) {
    return <p className="px-2 py-4 text-sm text-red-700">Failed to load subjects.</p>;
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-gradient-to-r from-white via-slate-50 to-white p-4">
        <h1 className="text-2xl font-semibold text-slate-900">Subjects</h1>
        <p className="mt-1 text-sm text-slate-700">
          Overview of your enrolled subjects and assignment activity.
        </p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Add Subject by Search
        </p>
        <div className="mt-2 flex flex-col gap-2">
          <input
            type="text"
            value={subjectSearch}
            onChange={(event) => setSubjectSearch(event.target.value)}
            placeholder="Search by subject code or name"
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
          />
          {subjectSearch.trim().length < 2 ? (
            <p className="text-xs text-slate-500">
              Type at least 2 characters to search.
            </p>
          ) : subjectSearchQuery.isLoading ? (
            <p className="text-xs text-slate-600">Searching subjects...</p>
          ) : subjectSearchQuery.isError ? (
            <p className="text-xs text-red-700">Failed to search subjects.</p>
          ) : (subjectSearchQuery.data?.courses.length ?? 0) === 0 ? (
            <p className="text-xs text-slate-600">No matching subjects.</p>
          ) : (
            <div className="space-y-2">
              {subjectSearchQuery.data?.courses.map((course) => (
                <div
                  key={course.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {course.courseCode} - {course.name}
                    </p>
                    <p className="text-xs text-slate-600">
                      {course.institution} • {course.assignmentCount} assignments
                    </p>
                  </div>
                  {course.isEnrolled ? (
                    <span className="rounded-full border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                      Enrolled
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => addSubjectMutation.mutate(course.id)}
                      disabled={addSubjectMutation.isPending}
                      className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                    >
                      Add subject
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {subjects.length === 0 ? (
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-700">No subjects found yet.</p>
        </section>
      ) : (
        <div className="space-y-3">
          <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {subjects.map((subject) => (
              <article
                key={subject.id}
                className={`rounded-lg border bg-white p-4 shadow-sm ${
                  expandedSubjectId === subject.id
                    ? 'border-slate-900'
                    : 'border-slate-200'
                }`}
              >
                <button
                  type="button"
                  onClick={() =>
                    setExpandedSubjectId((current) =>
                      current === subject.id ? null : subject.id,
                    )
                  }
                  className="w-full text-left"
                  aria-expanded={expandedSubjectId === subject.id}
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {subject.courseCode}
                  </p>
                  <h2 className="mt-1 text-base font-semibold text-slate-900">{subject.name}</h2>
                  <p className="mt-1 text-xs text-slate-600">{subject.institution}</p>
                  <div className="mt-3 flex items-center gap-2">
                    <span className="rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                      Assignments: {subject.assignmentCount}
                    </span>
                    <span className="rounded-full border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                      Active: {subject.activeCount}
                    </span>
                  </div>
                </button>
                <div className="mt-2 text-right">
                  <span className="text-[11px] font-medium text-slate-500">
                    {expandedSubjectId === subject.id ? 'Selected' : 'View assignments'}
                  </span>
                </div>
              </article>
            ))}
          </section>

          {expandedSubject ? (
            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Assignments in {expandedSubject.courseCode} - {expandedSubject.name}
              </p>
              <div className="mt-3 space-y-2">
                {expandedSubject.assignments.map((assignment) => (
                  <div
                    key={assignment.id}
                    className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2"
                  >
                    <p className="text-sm font-medium text-slate-900">
                      {assignment.title}
                    </p>
                    <p className="mt-1 text-xs text-slate-600">
                      {assignment.assignmentCode}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          assignment.status === 'ACTIVE'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {assignment.status}
                      </span>
                      <span className="text-[11px] text-slate-600">
                        Due:{' '}
                        {assignment.dueDate
                          ? new Date(assignment.dueDate).toLocaleDateString()
                          : 'No deadline'}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {latestLogByAssignmentId.has(assignment.id) ? (
                        <Link
                          href={`/log?logId=${encodeURIComponent(
                            latestLogByAssignmentId.get(assignment.id)?.id ?? '',
                          )}`}
                          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-800"
                        >
                          View log
                        </Link>
                      ) : (
                        <span className="text-[11px] text-slate-500">No logs yet</span>
                      )}
                      <Link
                        href={`/log?assignmentId=${encodeURIComponent(assignment.id)}`}
                        className="rounded-md bg-slate-900 px-2 py-1 text-[11px] font-semibold text-white"
                      >
                        New log
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
