'use client';

import { useEffect, useMemo, useState } from 'react';

type CourseOption = {
  id: string;
  courseCode: string;
  name: string;
  institution: string;
};

type CourseSelectorProps = {
  courses: CourseOption[];
  selectedCourseId: string | null;
  onSelect: (courseId: string | null) => void;
};

function courseDisplay(course: CourseOption): string {
  return `${course.courseCode} - ${course.name}`;
}

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function rankCourseMatch(course: CourseOption, query: string): number {
  const code = normalizeSearchText(course.courseCode);
  const name = normalizeSearchText(course.name);
  const institution = normalizeSearchText(course.institution);

  if (code.startsWith(query)) {
    return 0;
  }

  if (name.startsWith(query)) {
    return 1;
  }

  if (name.split(/\s+/).some((part) => part.startsWith(query))) {
    return 2;
  }

  if (code.includes(query)) {
    return 3;
  }

  if (name.includes(query) || institution.includes(query)) {
    return 4;
  }

  return 99;
}

export function CourseSelector({ courses, selectedCourseId, onSelect }: CourseSelectorProps) {
  const selectedCourse = useMemo(
    () => courses.find((course) => course.id === selectedCourseId) ?? null,
    [courses, selectedCourseId],
  );
  const selectedLabel = useMemo(() => {
    const selected = courses.find((course) => course.id === selectedCourseId);
    return selected ? courseDisplay(selected) : '';
  }, [courses, selectedCourseId]);
  const [searchValue, setSearchValue] = useState(selectedLabel);

  useEffect(() => {
    setSearchValue(selectedLabel);
  }, [selectedLabel]);

  const filteredCourses = useMemo(() => {
    const query = normalizeSearchText(searchValue);
    if (!query) {
      return courses.slice(0, 12);
    }

    return courses
      .map((course) => ({
        course,
        rank: rankCourseMatch(course, query),
      }))
      .filter((entry) => entry.rank < 99)
      .sort((a, b) => {
        if (a.rank !== b.rank) {
          return a.rank - b.rank;
        }
        return a.course.courseCode.localeCompare(b.course.courseCode);
      })
      .map((entry) => entry.course)
      .slice(0, 20);
  }, [courses, searchValue]);

  return (
    <div className="space-y-2">
      <label htmlFor="course-selector" className="block text-sm font-medium text-slate-900">
        Course
      </label>
      <p className="text-xs text-slate-600">Search by course code or name, then choose a match.</p>
      <input
        id="course-selector"
        type="text"
        value={searchValue}
        onChange={(event) => {
          const value = event.target.value;
          setSearchValue(value);
          if (!value.trim()) {
            onSelect(null);
          }
        }}
        placeholder="Search courses (e.g. TDT4290)"
        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
      />
      <div
        className="max-h-56 overflow-y-auto rounded-md border border-slate-300 bg-white"
        role="listbox"
        aria-label="Available courses"
      >
        {filteredCourses.length === 0 ? (
          selectedCourse ? null : <p className="px-3 py-2 text-sm text-slate-600">No courses match your search.</p>
        ) : (
          filteredCourses.map((course) => {
            const active = course.id === selectedCourse?.id;
            return (
              <button
                key={course.id}
                type="button"
                onClick={() => {
                  onSelect(course.id);
                  setSearchValue(courseDisplay(course));
                }}
                className={`block w-full px-3 py-2 text-left text-sm ${
                  active ? 'bg-slate-900 text-white' : 'text-slate-900 hover:bg-slate-50'
                }`}
                role="option"
                aria-selected={active}
              >
                <span className="font-medium">{course.courseCode}</span>
                <span className={`${active ? 'text-slate-200' : 'text-slate-600'}`}> - {course.name}</span>
              </button>
            );
          })
        )}
      </div>
      {courses.length === 0 ? (
        <p className="text-xs text-amber-700">No enrolled courses available.</p>
      ) : null}
    </div>
  );
}
