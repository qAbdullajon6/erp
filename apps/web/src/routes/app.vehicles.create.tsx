import { createFileRoute } from "@tanstack/react-router";
import { VehiclesCreateForm } from "@/components/vehicles/vehicles-create-form";
import { ProtectedApiRoute } from "@/components/layout/protected-api-route";

export const Route = createFileRoute("/app/vehicles/create")({
  component: VehiclesCreatePage,
});

function VehiclesCreatePage() {
  return (
    <ProtectedApiRoute>
      <VehiclesCreateForm />
    </ProtectedApiRoute>
  );
}
