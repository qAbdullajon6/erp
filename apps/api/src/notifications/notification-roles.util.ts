import { MembershipRole, NotificationCategory } from "@prisma/client";

const ALL_CATEGORIES: NotificationCategory[] = ["OPERATIONS", "FINANCE", "CUSTOMERS", "FLEET"];

/// Which notification categories each role may see — used both for
/// row-level filtering in NotificationsService (a Dispatcher's list never
/// includes FINANCE/CUSTOMERS rows, even though the route itself allows
/// DISPATCHER through RolesGuard) and to compute 404-vs-visible for
/// single-notification actions (read/unread/archive) on a notification
/// outside the caller's allowed categories. DRIVER has no entry — matched
/// against `[]`, so every route the guard doesn't already block also
/// resolves to zero visible rows/actions for it.
const ROLE_CATEGORIES: Record<MembershipRole, NotificationCategory[]> = {
  ADMIN: ALL_CATEGORIES,
  OPERATIONS_MANAGER: ["OPERATIONS", "FLEET"],
  DISPATCHER: ["OPERATIONS", "FLEET"],
  ACCOUNTANT: ["FINANCE"],
  SALES_CRM_MANAGER: ["CUSTOMERS"],
  DRIVER: [],
};

export function categoriesForRole(role: MembershipRole): NotificationCategory[] {
  return ROLE_CATEGORIES[role];
}
