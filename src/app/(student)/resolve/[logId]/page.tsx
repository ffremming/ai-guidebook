import { ResolutionPane } from '@/components/resolution/resolution-pane';

export default async function ResolvePage({
  params,
}: {
  params: Promise<{ logId: string }>;
}) {
  const { logId } = await params;
  return <ResolutionPane logId={logId} />;
}
