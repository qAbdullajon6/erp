import { createFileRoute } from "@tanstack/react-router";
import { DispatchConnectedView } from "@/components/dispatch/dispatch-connected-view";
import { ProtectedApiRoute } from "@/components/layout/protected-api-route";

export const Route = createFileRoute("/app/dispatch")({
  component: DispatchPage,
});

function DispatchPage() {
  return (
    <ProtectedApiRoute>
      <DispatchConnectedView />
    </ProtectedApiRoute>
  );
}
