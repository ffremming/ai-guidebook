import { ReflectionJournalPage } from '@/components/reflections/reflection-journal-page';

export default async function ReflectionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    assignmentId?: string;
    triggerType?: string;
    returnTo?: string;
    action?: string;
  }>;
}) {
  const params = await searchParams;

  return (
    <ReflectionJournalPage
      assignmentId={params.assignmentId ?? null}
      triggerType={params.triggerType ?? null}
      returnTo={params.returnTo ?? null}
      action={params.action ?? null}
    />
  );
}
