import { createFileRoute } from "@tanstack/react-router";
import { CustomersConnectedView } from "@/components/customers/customers-connected-view";
import { ProtectedApiRoute } from "@/components/layout/protected-api-route";

export const Route = createFileRoute("/app/customers")({
  component: CustomersPage,
});

function CustomersPage() {
  return (
    <ProtectedApiRoute>
      <CustomersConnectedView />
    </ProtectedApiRoute>
  );
}
