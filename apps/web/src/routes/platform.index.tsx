import { createFileRoute } from '@tanstack/react-router';
import { PlatformDashboard } from '@/components/platform/platform-dashboard';

export const Route = createFileRoute('/platform/')({
  head: () => ({ meta: [{ title: 'Dashboard — Platform Console' }] }),
  component: PlatformDashboardPage,
});

function PlatformDashboardPage() {
  return <PlatformDashboard />;
}
