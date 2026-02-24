import { DeclarationDraftView } from '@/components/declarations/declaration-draft-view';

export default async function DeclarationPage({
  params,
}: {
  params: Promise<{ assignmentId: string }>;
}) {
  const { assignmentId } = await params;
  return <DeclarationDraftView assignmentId={assignmentId} />;
}
