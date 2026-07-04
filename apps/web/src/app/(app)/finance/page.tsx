import { FinanceView } from "@/components/finance/finance-view";
import { FinanceConnectedView } from "@/components/finance/finance-connected-view";
import { ProtectedApiRoute } from "@/components/layout/protected-api-route";
import { getDataMode } from "@/lib/data-mode";

export default function FinancePage() {
  if (getDataMode() !== "api") {
    return <FinanceView />;
  }

  return (
    <ProtectedApiRoute>
      <FinanceConnectedView />
    </ProtectedApiRoute>
  );
}
