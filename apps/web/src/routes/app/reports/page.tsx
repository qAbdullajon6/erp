import { ProtectedApiRoute } from "@/components/layout/protected-api-route";
import { ReportsConnectedView } from "@/components/reports/reports-connected-view";

export default function ReportsPage() {
  return (
    <ProtectedApiRoute>
      <ReportsConnectedView />
    </ProtectedApiRoute>
  );
}
