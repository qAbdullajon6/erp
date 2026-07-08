import { DispatchConnectedView } from "@/components/dispatch/dispatch-connected-view";
import { ProtectedApiRoute } from "@/components/layout/protected-api-route";

export default function DispatchPage() {
  return (
    <ProtectedApiRoute>
      <DispatchConnectedView />
    </ProtectedApiRoute>
  );
}
