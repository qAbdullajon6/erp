import { createFileRoute, redirect } from "@tanstack/react-router";
import { ProtectedApiRoute } from "@/components/layout/protected-api-route";
import { FLEET_ROLES } from "@/lib/role-access";

export const Route = createFileRoute("/app/drivers/create")({
  head: () => ({
    meta: [{ title: "New Driver — FlowERP AI" }],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/app/drivers", search: { create: true } as const });
  },
  component: CreateDriverRedirect,
});

function CreateDriverRedirect() {
  return (
    <ProtectedApiRoute requireRoles={FLEET_ROLES}>
      <div className="p-6 text-sm text-muted-foreground">Opening new driver…</div>
    </ProtectedApiRoute>
  );
}
