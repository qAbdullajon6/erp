import { createFileRoute, Outlet } from '@tanstack/react-router';
import { ProtectedApiRoute } from '@/components/layout/protected-api-route';
import type { MembershipRole } from '@/lib/api/organizations';

const DRIVER_ONLY: MembershipRole[] = ['DRIVER'];

export const Route = createFileRoute('/app/driver')({
  component: DriverWorkspaceLayout,
});

function DriverWorkspaceLayout() {
  return (
    <ProtectedApiRoute requireRoles={DRIVER_ONLY}>
      <Outlet />
    </ProtectedApiRoute>
  );
}
