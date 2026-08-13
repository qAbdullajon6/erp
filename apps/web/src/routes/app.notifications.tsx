import { createFileRoute } from "@tanstack/react-router";
import { ProtectedApiRoute } from "@/components/layout/protected-api-route";
import { NotificationsView } from "@/components/notifications/notifications-view";
import { ALL_STAFF_ROLES } from "@/lib/role-access";
import { asSearchString } from "@/lib/search-params";
import type { NotificationCategory, NotificationSeverity } from "@/lib/api/notifications";

const CATEGORIES: readonly NotificationCategory[] = ["OPERATIONS", "FINANCE", "CUSTOMERS", "FLEET"];
const SEVERITIES: readonly NotificationSeverity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

export type NotificationsTab = "preferences";

export type NotificationsSearch = {
  tab?: NotificationsTab;
  search?: string;
  category?: NotificationCategory;
  severity?: NotificationSeverity;
  isRead?: boolean;
  isArchived?: boolean;
  page?: number;
};

export const Route = createFileRoute("/app/notifications")({
  head: () => ({
    meta: [{ title: "Notifications — FlowERP AI" }],
  }),
  validateSearch: (search: Record<string, unknown>): NotificationsSearch => {
    const category = search.category;
    const severity = search.severity;
    const page = search.page;
    return {
      tab: search.tab === "preferences" ? "preferences" : undefined,
      search: asSearchString(search.search),
      category: (CATEGORIES as readonly unknown[]).includes(category)
        ? (category as NotificationCategory)
        : undefined,
      severity: (SEVERITIES as readonly unknown[]).includes(severity)
        ? (severity as NotificationSeverity)
        : undefined,
      isRead: typeof search.isRead === "boolean" ? search.isRead : undefined,
      isArchived: typeof search.isArchived === "boolean" ? search.isArchived : undefined,
      page: typeof page === "number" && Number.isFinite(page) && page >= 1 ? Math.trunc(page) : undefined,
    };
  },
  component: NotificationsPage,
});

function NotificationsPage() {
  return (
    <ProtectedApiRoute requireRoles={ALL_STAFF_ROLES}>
      <NotificationsView />
    </ProtectedApiRoute>
  );
}
