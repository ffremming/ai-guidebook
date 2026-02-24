import { ManualLogForm } from '@/components/forms/manual-log-form';

export default async function LogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const logIdParam = params.logId;
  const assignmentIdParam = params.assignmentId;
  const initialLogId = typeof logIdParam === 'string' ? logIdParam : null;
  const initialAssignmentId =
    typeof assignmentIdParam === 'string' ? assignmentIdParam : null;

  return (
    <ManualLogForm
      initialLogId={initialLogId}
      initialAssignmentId={initialAssignmentId}
    />
  );
}
