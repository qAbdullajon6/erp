import { createFileRoute, redirect } from "@tanstack/react-router";
import { ProtectedApiRoute } from "@/components/layout/protected-api-route";
import { FLEET_ROLES } from "@/lib/role-access";

export const Route = createFileRoute("/app/vehicles/create")({
  beforeLoad: () => {
    throw redirect({ to: "/app/vehicles", search: { create: true } as const });
  },
  component: CreateVehicleRedirect,
});

function CreateVehicleRedirect() {
  return (
    <ProtectedApiRoute requireRoles={FLEET_ROLES}>
      <div className="p-6 text-sm text-muted-foreground">Opening new vehicle…</div>
    </ProtectedApiRoute>
  );
}
