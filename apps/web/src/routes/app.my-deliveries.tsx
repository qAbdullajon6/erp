import { createFileRoute } from "@tanstack/react-router";
import { MyDeliveriesView } from "@/components/my-deliveries/my-deliveries-view";
import { ProtectedApiRoute } from "@/components/layout/protected-api-route";
import type { MembershipRole } from "@/lib/api/organizations";

const DRIVER_ONLY: MembershipRole[] = ["DRIVER"];

export const Route = createFileRoute("/app/my-deliveries")({
  component: MyDeliveriesPage,
});

function MyDeliveriesPage() {
  return (
    <ProtectedApiRoute requireRoles={DRIVER_ONLY}>
      <MyDeliveriesView />
    </ProtectedApiRoute>
  );
}
