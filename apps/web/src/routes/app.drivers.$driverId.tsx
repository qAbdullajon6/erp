import { createFileRoute } from "@tanstack/react-router";
import { DriversDetail } from "@/components/drivers/drivers-detail";
import { ProtectedApiRoute } from "@/components/layout/protected-api-route";

export const Route = createFileRoute("/app/drivers/$driverId")({
  component: DriversDetailPage,
});

function DriversDetailPage() {
  const { driverId } = Route.useParams();

  return (
    <ProtectedApiRoute>
      <DriversDetail driverId={driverId} />
    </ProtectedApiRoute>
  );
}
