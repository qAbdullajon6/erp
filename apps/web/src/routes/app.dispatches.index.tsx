import { createFileRoute } from "@tanstack/react-router";
import { DispatchesList } from "@/components/dispatch/dispatches-list";
import { ProtectedApiRoute } from "@/components/layout/protected-api-route";

export const Route = createFileRoute("/app/dispatches/")({
  component: DispatchesPage,
});

function DispatchesPage() {
  return (
    <ProtectedApiRoute>
      <DispatchesList />
    </ProtectedApiRoute>
  );
}
