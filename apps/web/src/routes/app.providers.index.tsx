import { createFileRoute } from "@tanstack/react-router";
import { ProvidersOverview } from "@/components/fleet-providers/providers-overview";
import { ProtectedApiRoute } from "@/components/layout/protected-api-route";
import { ADMIN_OPS_ROLES } from "@/lib/role-access";

export const Route = createFileRoute("/app/providers/")({
  head: () => ({
    meta: [{ title: "GPS Providers — FlowERP" }],
  }),
  component: ProvidersPage,
});

/// TelematicsDevicesController is ADMIN + OPERATIONS_MANAGER only.
function ProvidersPage() {
  return (
    <ProtectedApiRoute requireRoles={ADMIN_OPS_ROLES}>
      <ProvidersOverview />
    </ProtectedApiRoute>
  );
}
