import { getDataMode } from "@/lib/data-mode";
import { ProtectedApiRoute } from "@/components/layout/protected-api-route";
import { NotificationCenterView } from "@/components/notifications/notification-center-view";
import { NotificationsConnectedView } from "@/components/notifications/notifications-connected-view";

export default function NotificationsPage() {
  if (getDataMode() !== "api") {
    return <NotificationCenterView />;
  }
  return (
    <ProtectedApiRoute>
      <NotificationsConnectedView />
    </ProtectedApiRoute>
  );
}
