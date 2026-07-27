import { createFileRoute } from "@tanstack/react-router";
import { FinanceConnectedView } from "@/components/finance/finance-connected-view";
import { ProtectedApiRoute } from "@/components/layout/protected-api-route";
import { ALL_STAFF_ROLES } from "@/lib/role-access";

export const Route = createFileRoute("/app/finance")({
  component: FinancePage,
});

function FinancePage() {
  return (
    <ProtectedApiRoute requireRoles={ALL_STAFF_ROLES}>
      <FinanceConnectedView />
    </ProtectedApiRoute>
  );
}
