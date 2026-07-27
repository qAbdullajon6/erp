import { createFileRoute } from '@tanstack/react-router';
import { SystemView } from '@/components/platform/system-view';

export const Route = createFileRoute('/platform/system/')({
  head: () => ({ meta: [{ title: 'System — Platform Console' }] }),
  component: SystemPage,
});

function SystemPage() {
  return <SystemView />;
}
