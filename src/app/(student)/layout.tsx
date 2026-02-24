import { StudentShell } from '@/components/layout/student-shell';

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return <StudentShell>{children}</StudentShell>;
}
