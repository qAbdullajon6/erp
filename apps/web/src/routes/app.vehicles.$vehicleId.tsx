import { createFileRoute } from "@tanstack/react-router";
import { VehiclesDetail } from "@/components/vehicles/vehicles-detail";
import { ProtectedApiRoute } from "@/components/layout/protected-api-route";
import { FLEET_ROLES } from "@/lib/role-access";

export const Route = createFileRoute("/app/vehicles/$vehicleId")({
  component: VehiclesDetailPage,
});

function VehiclesDetailPage() {
  const { vehicleId } = Route.useParams();

  return (
    <ProtectedApiRoute requireRoles={FLEET_ROLES}>
      <VehiclesDetail vehicleId={vehicleId} />
    </ProtectedApiRoute>
  );
}
