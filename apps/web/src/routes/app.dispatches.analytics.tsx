import { createFileRoute } from '@tanstack/react-router';
import { DispatchAnalyticsDashboard } from '@/components/dispatch/analytics/dispatch-analytics-dashboard';
import { ProtectedApiRoute } from '@/components/layout/protected-api-route';
import { DISPATCH_ROLES } from '@/lib/role-access';

export const Route = createFileRoute('/app/dispatches/analytics')({
  component: DispatchAnalyticsPage,
});

function DispatchAnalyticsPage() {
  return (
    <ProtectedApiRoute requireRoles={DISPATCH_ROLES}>
      <DispatchAnalyticsDashboard />
    </ProtectedApiRoute>
  );
}
