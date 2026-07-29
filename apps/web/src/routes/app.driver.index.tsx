import { createFileRoute } from '@tanstack/react-router';
import { DriverWorkspaceDashboard } from '@/components/driver-workspace/driver-workspace-dashboard';

export const Route = createFileRoute('/app/driver/')({
  component: DriverWorkspaceIndexPage,
});

function DriverWorkspaceIndexPage() {
  return <DriverWorkspaceDashboard />;
}
