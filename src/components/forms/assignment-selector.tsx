'use client';

import { useEffect, useMemo, useState } from 'react';

type AssignmentOption = {
  id: string;
  title: string;
  courseId: string;
  assignmentCode: string;
};

type AssignmentSelectorProps = {
  assignments: AssignmentOption[];
  value: string;
  disabled: boolean;
  error?: string;
  onChange: (value: string) => void;
};

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function AssignmentSelector({
  assignments,
  value,
  disabled,
  error,
  onChange,
}: AssignmentSelectorProps) {
  const selectedAssignment = assignments.find((assignment) => assignment.id === value) ?? null;
  const selectedLabel = selectedAssignment
    ? `${selectedAssignment.title} (${selectedAssignment.assignmentCode})`
    : '';
  const [searchValue, setSearchValue] = useState(selectedLabel);
  const isLockedToSelected =
    Boolean(selectedAssignment) &&
    normalizeSearchText(searchValue) === normalizeSearchText(selectedLabel);

  useEffect(() => {
    setSearchValue(selectedLabel);
  }, [selectedLabel]);

  const filteredAssignments = useMemo(() => {
    const query = normalizeSearchText(searchValue);

    if (!query) {
      return assignments;
    }

    return assignments.filter((assignment) => {
      const haystack = normalizeSearchText(`${assignment.title} ${assignment.assignmentCode}`);
      return haystack.includes(query);
    });
  }, [assignments, searchValue]);

  return (
    <div className="space-y-2">
      <label htmlFor="assignmentId" className="block text-sm font-medium text-slate-900">
        Assignment
      </label>
      <input
        id="assignment-search"
        type="text"
        value={searchValue}
        onChange={(event) => {
          const next = event.target.value;
          setSearchValue(next);
          if (!next.trim()) {
            onChange('');
          }
        }}
        placeholder="Search assignments by title or code"
        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100"
        disabled={disabled}
      />
      <input type="hidden" id="assignmentId" name="assignmentId" value={value} readOnly />
      {!isLockedToSelected ? (
        <div
          className="max-h-56 overflow-y-auto rounded-md border border-slate-300 bg-white"
          role="listbox"
          aria-label="Available assignments"
          aria-disabled={disabled}
          aria-invalid={error ? true : undefined}
        >
          {disabled ? null : filteredAssignments.length === 0 ? (
            selectedAssignment ? null : <p className="px-3 py-2 text-sm text-slate-600">No assignments found for this course.</p>
          ) : (
            filteredAssignments.map((assignment) => {
              const active = assignment.id === selectedAssignment?.id;
              return (
                <button
                  key={assignment.id}
                  type="button"
                  onClick={() => {
                    onChange(assignment.id);
                    setSearchValue(`${assignment.title} (${assignment.assignmentCode})`);
                  }}
                  className={`block w-full px-3 py-2 text-left text-sm ${
                    active ? 'bg-slate-900 text-white' : 'text-slate-900 hover:bg-slate-50'
                  }`}
                  role="option"
                  aria-selected={active}
                  disabled={disabled}
                >
                  <span className="font-medium">{assignment.title}</span>
                  <span className={`${active ? 'text-slate-200' : 'text-slate-600'}`}>
                    {' '}
                    ({assignment.assignmentCode})
                  </span>
                </button>
              );
            })
          )}
        </div>
      ) : null}
      {!disabled && assignments.length === 0 ? (
        <p className="text-xs text-amber-700">No assignments found for this course.</p>
      ) : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
