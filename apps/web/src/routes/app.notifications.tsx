import { createFileRoute } from "@tanstack/react-router";
import { ProtectedApiRoute } from "@/components/layout/protected-api-route";
import { NotificationsConnectedView } from "@/components/notifications/notifications-connected-view";

export const Route = createFileRoute("/app/notifications")({
  component: NotificationsPage,
});

function NotificationsPage() {
  return (
    <ProtectedApiRoute>
      <NotificationsConnectedView />
    </ProtectedApiRoute>
  );
}
