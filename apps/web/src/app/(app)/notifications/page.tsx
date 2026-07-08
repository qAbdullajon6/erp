import { ProtectedApiRoute } from "@/components/layout/protected-api-route";
import { NotificationsConnectedView } from "@/components/notifications/notifications-connected-view";

export default function NotificationsPage() {
  return (
    <ProtectedApiRoute>
      <NotificationsConnectedView />
    </ProtectedApiRoute>
  );
}
