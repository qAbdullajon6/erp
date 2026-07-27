import { createFileRoute } from "@tanstack/react-router";
import { TrackingDebugConsole } from "@/components/fleet-tracking/tracking-debug-console";
import { ProtectedApiRoute } from "@/components/layout/protected-api-route";
import { ADMIN_OPS_ROLES } from "@/lib/role-access";

export const Route = createFileRoute("/app/fleet-tracking_/debug")({
  head: () => ({
    meta: [{ title: "Tracking Debug — FlowERP" }],
  }),
  component: TrackingDebugPage,
});

/// Phase 11 debug console — ADMIN + OPERATIONS_MANAGER only, mirrors API.
function TrackingDebugPage() {
  return (
    <ProtectedApiRoute requireRoles={ADMIN_OPS_ROLES}>
      <TrackingDebugConsole />
    </ProtectedApiRoute>
  );
}
