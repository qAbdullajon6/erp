import { createFileRoute } from "@tanstack/react-router";
import { ProtectedApiRoute } from "@/components/layout/protected-api-route";
import { ReportsView } from "@/components/reports/reports-view";
import { ALL_STAFF_ROLES } from "@/lib/role-access";

export const Route = createFileRoute("/app/reports")({
  head: () => ({
    meta: [{ title: "Reports — FlowERP AI" }],
  }),
  component: ReportsPage,
});

function ReportsPage() {
  return (
    <ProtectedApiRoute requireRoles={ALL_STAFF_ROLES}>
      <ReportsView />
    </ProtectedApiRoute>
  );
}
