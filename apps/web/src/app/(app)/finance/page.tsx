import { FinanceConnectedView } from "@/components/finance/finance-connected-view";
import { ProtectedApiRoute } from "@/components/layout/protected-api-route";

export default function FinancePage() {
  return (
    <ProtectedApiRoute>
      <FinanceConnectedView />
    </ProtectedApiRoute>
  );
}
