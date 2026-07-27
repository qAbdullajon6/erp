import { createFileRoute } from "@tanstack/react-router";
import { DevicesDetail } from "@/components/fleet-devices/devices-detail";
import { ProtectedApiRoute } from "@/components/layout/protected-api-route";
import { ADMIN_OPS_ROLES } from "@/lib/role-access";

export const Route = createFileRoute("/app/devices/$deviceId")({
  head: () => ({
    meta: [{ title: "Device — FlowERP" }],
  }),
  component: DevicesDetailPage,
});

function DevicesDetailPage() {
  const { deviceId } = Route.useParams();

  return (
    <ProtectedApiRoute requireRoles={ADMIN_OPS_ROLES}>
      <DevicesDetail deviceId={deviceId} />
    </ProtectedApiRoute>
  );
}
