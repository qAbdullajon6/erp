import { createFileRoute } from "@tanstack/react-router";
import { NotificationsView } from "@/components/notifications/notifications-view";

export const Route = createFileRoute("/app/notifications")({
  head: () => ({
    meta: [{ title: "Notifications — FlowERP AI" }],
  }),
  component: NotificationsView,
});
