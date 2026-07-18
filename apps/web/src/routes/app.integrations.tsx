import { createFileRoute } from "@tanstack/react-router";
import { IntegrationsView } from "@/components/integrations/integrations-view";
import { ProtectedApiRoute } from "@/components/layout/protected-api-route";
import { ADMIN_OPS_ROLES } from "@/lib/role-access";

export const Route = createFileRoute("/app/integrations")({
  head: () => ({
    meta: [{ title: "Integrations — FlowERP AI" }],
  }),
  component: IntegrationsPage,
});

function IntegrationsPage() {
  return (
    <ProtectedApiRoute requireRoles={ADMIN_OPS_ROLES}>
      <IntegrationsView />
    </ProtectedApiRoute>
  );
}
