import { createFileRoute } from '@tanstack/react-router';
import { AnalyticsView } from '@/components/platform/analytics-view';

export const Route = createFileRoute('/platform/analytics/')({
  head: () => ({ meta: [{ title: 'Analytics — Platform Console' }] }),
  component: AnalyticsPage,
});

function AnalyticsPage() {
  return <AnalyticsView />;
}
