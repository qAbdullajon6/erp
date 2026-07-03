import { DispatchBoard } from "@/components/dispatch/dispatch-board";
import { DispatchConnectedView } from "@/components/dispatch/dispatch-connected-view";
import { ProtectedApiRoute } from "@/components/layout/protected-api-route";
import { getDataMode } from "@/lib/data-mode";

export default function DispatchPage() {
  if (getDataMode() !== "api") {
    return <DispatchBoard />;
  }

  return (
    <ProtectedApiRoute>
      <DispatchConnectedView />
    </ProtectedApiRoute>
  );
}
