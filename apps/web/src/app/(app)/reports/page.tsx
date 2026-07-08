import { getDataMode } from "@/lib/data-mode";
import { ProtectedApiRoute } from "@/components/layout/protected-api-route";
import { ReportsView } from "@/components/reports/reports-view";
import { ReportsConnectedView } from "@/components/reports/reports-connected-view";

export default function ReportsPage() {
  if (getDataMode() !== "api") {
    return <ReportsView />;
  }
  return (
    <ProtectedApiRoute>
      <ReportsConnectedView />
    </ProtectedApiRoute>
  );
}
