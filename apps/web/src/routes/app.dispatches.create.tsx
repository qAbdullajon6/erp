import { createFileRoute } from "@tanstack/react-router";
import { DispatchesCreateForm } from "@/components/dispatch/dispatches-create-form";
import { ProtectedApiRoute } from "@/components/layout/protected-api-route";

export const Route = createFileRoute("/app/dispatches/create")({
  component: DispatchesCreatePage,
});

function DispatchesCreatePage() {
  return (
    <ProtectedApiRoute>
      <DispatchesCreateForm />
    </ProtectedApiRoute>
  );
}
