import { createFileRoute } from "@tanstack/react-router";
import { FinanceConnectedView } from "@/components/finance/finance-connected-view";
import { ProtectedApiRoute } from "@/components/layout/protected-api-route";

export const Route = createFileRoute("/app/finance")({
  component: FinancePage,
});

function FinancePage() {
  return (
    <ProtectedApiRoute>
      <FinanceConnectedView />
    </ProtectedApiRoute>
  );
}
