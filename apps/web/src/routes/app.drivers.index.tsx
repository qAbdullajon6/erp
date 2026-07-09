import { createFileRoute } from "@tanstack/react-router";
import { DriversList } from "@/components/drivers/drivers-list";
import { ProtectedApiRoute } from "@/components/layout/protected-api-route";

export const Route = createFileRoute("/app/drivers/")({
  component: DriversPage,
});

function DriversPage() {
  return (
    <ProtectedApiRoute>
      <DriversList />
    </ProtectedApiRoute>
  );
}
