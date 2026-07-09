import { createFileRoute } from "@tanstack/react-router";
import { VehiclesList } from "@/components/vehicles/vehicles-list";
import { ProtectedApiRoute } from "@/components/layout/protected-api-route";

export const Route = createFileRoute("/app/vehicles/")({
  component: VehiclesPage,
});

function VehiclesPage() {
  return (
    <ProtectedApiRoute>
      <VehiclesList />
    </ProtectedApiRoute>
  );
}
