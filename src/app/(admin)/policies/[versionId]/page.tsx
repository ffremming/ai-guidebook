import { PolicyVersionDetailPage } from '@/components/policies/policy-version-detail-page';

export default async function PolicyVersionPage({
  params,
}: {
  params: Promise<{ versionId: string }>;
}) {
  const { versionId } = await params;
  return <PolicyVersionDetailPage versionId={versionId} />;
}
