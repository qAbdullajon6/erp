import { createFileRoute } from "@tanstack/react-router";
import { ProtectedApiRoute } from "@/components/layout/protected-api-route";
import { NotificationsView } from "@/components/notifications/notifications-view";
import { ALL_STAFF_ROLES } from "@/lib/role-access";

export const Route = createFileRoute("/app/notifications")({
  head: () => ({
    meta: [{ title: "Notifications — FlowERP AI" }],
  }),
  component: NotificationsPage,
});

function NotificationsPage() {
  return (
    <ProtectedApiRoute requireRoles={ALL_STAFF_ROLES}>
      <NotificationsView />
    </ProtectedApiRoute>
  );
}
