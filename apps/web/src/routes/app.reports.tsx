import { createFileRoute } from "@tanstack/react-router";
import { ProtectedApiRoute } from "@/components/layout/protected-api-route";
import { ReportsConnectedView } from "@/components/reports/reports-connected-view";

export const Route = createFileRoute("/app/reports")({
  component: ReportsPage,
});

function ReportsPage() {
  return (
    <ProtectedApiRoute>
      <ReportsConnectedView />
    </ProtectedApiRoute>
  );
}
