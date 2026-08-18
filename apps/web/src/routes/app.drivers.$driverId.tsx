import { createFileRoute } from "@tanstack/react-router";
import { DriversDetail } from "@/components/drivers/drivers-detail";
import { ProtectedApiRoute } from "@/components/layout/protected-api-route";
import { FLEET_ROLES } from "@/lib/role-access";

export const Route = createFileRoute("/app/drivers/$driverId")({
  head: () => ({
    meta: [{ title: "Driver — FlowERP AI" }],
  }),
  component: DriversDetailPage,
});

function DriversDetailPage() {
  const { driverId } = Route.useParams();

  return (
    <ProtectedApiRoute requireRoles={FLEET_ROLES}>
      <DriversDetail driverId={driverId} />
    </ProtectedApiRoute>
  );
}
