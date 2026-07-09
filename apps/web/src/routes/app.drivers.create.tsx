import { createFileRoute } from "@tanstack/react-router";
import { DriversCreateForm } from "@/components/drivers/drivers-create-form";
import { ProtectedApiRoute } from "@/components/layout/protected-api-route";

export const Route = createFileRoute("/app/drivers/create")({
  component: DriversCreatePage,
});

function DriversCreatePage() {
  return (
    <ProtectedApiRoute>
      <DriversCreateForm />
    </ProtectedApiRoute>
  );
}
