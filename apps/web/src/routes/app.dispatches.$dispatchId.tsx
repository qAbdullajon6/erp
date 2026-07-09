import { createFileRoute } from "@tanstack/react-router";
import { DispatchesDetail } from "@/components/dispatch/dispatches-detail";
import { ProtectedApiRoute } from "@/components/layout/protected-api-route";

export const Route = createFileRoute("/app/dispatches/$dispatchId")({
  component: DispatchesDetailPage,
});

function DispatchesDetailPage() {
  const { dispatchId } = Route.useParams();

  return (
    <ProtectedApiRoute>
      <DispatchesDetail dispatchId={dispatchId} />
    </ProtectedApiRoute>
  );
}
