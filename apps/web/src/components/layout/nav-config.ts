import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Package,
  Route as RouteIcon,
  MapPin,
  Truck,
  Wallet,
  Sparkles,
  Settings,
  BarChart3,
  PackageCheck,
  Users,
  Inbox,
  Shield,
  FileUp,
  Zap,
  Code2,
  Plug,
} from "lucide-react";
import type { MembershipRole } from "@/lib/api/organizations";

export type NavItem = {
  icon: LucideIcon;
  label: string;
  path: string;
  /// Roles whose API can actually serve this screen. Omitted means every role
  /// in DEFAULT_NAV. Kept in step with each controller's read-role list — a
  /// link a role cannot use is worse than no link, because it 403s on click.
  roles?: MembershipRole[];
  /// FlowERP staff only, regardless of role. The API enforces this with
  /// PlatformAdminGuard; hiding the link is a courtesy, not the control.
  platformAdminOnly?: boolean;
  /// Visual grouping in the sidebar only — purely presentational, has no
  /// bearing on which role can reach the route.
  group: "Overview" | "Operations" | "Finance" | "Workspace";
};

export const DRIVER_NAV: NavItem[] = [
  { icon: LayoutDashboard, label: "Overview", path: "/app", group: "Overview" },
  { icon: PackageCheck, label: "My Deliveries", path: "/app/my-deliveries", group: "Overview" },
  { icon: Settings, label: "Settings", path: "/app/settings", group: "Workspace" },
];

/// Read-role sources, for whoever has to keep these honest:
///   Orders      OrdersController.READ_ROLES        — all five
///   Dispatches  DispatchesController.ROLES_READ    — no SALES_CRM_MANAGER
///   Customers   CustomersController.READ_ROLES     — all five
///   Drivers     DriversController.ROLES            — ADMIN/OPS/DISPATCHER
///   Vehicles    VehiclesController.ROLES           — ADMIN/OPS/DISPATCHER
///   Finance     FinanceController.ROLES            — all five
///   Reports     ReportsController.ROLES            — all five
export const FLEET_ROLES: MembershipRole[] = ["ADMIN", "OPERATIONS_MANAGER", "DISPATCHER"];

export const DEFAULT_NAV: NavItem[] = [
  { icon: LayoutDashboard, label: "Overview", path: "/app", group: "Overview" },
  { icon: Package, label: "Orders", path: "/app/orders", group: "Operations" },
  {
    icon: RouteIcon,
    label: "Dispatches",
    path: "/app/dispatches",
    roles: ["ADMIN", "OPERATIONS_MANAGER", "DISPATCHER", "ACCOUNTANT"],
    group: "Operations",
  },
  { icon: MapPin, label: "Customers", path: "/app/customers", group: "Operations" },
  { icon: Users, label: "Drivers", path: "/app/drivers", roles: FLEET_ROLES, group: "Operations" },
  // Vehicles had routes, a list, a detail page and a create form, and no way
  // in: nothing anywhere linked to /app/vehicles.
  { icon: Truck, label: "Vehicles", path: "/app/vehicles", roles: FLEET_ROLES, group: "Operations" },
  { icon: Wallet, label: "Finance", path: "/app/finance", group: "Finance" },
  { icon: BarChart3, label: "Reports", path: "/app/reports", group: "Finance" },
  // Demo requests from the marketing site. They belong to FlowERP, not to any
  // customer organization, so no MembershipRole can reach them.
  { icon: Inbox, label: "Leads", path: "/app/leads", platformAdminOnly: true, group: "Workspace" },
  { icon: Sparkles, label: "AI Assistant", path: "/app/ai-assistant", group: "Workspace" },
  {
    icon: Shield,
    label: "Audit Log",
    path: "/app/audit-logs",
    roles: ["ADMIN", "OPERATIONS_MANAGER", "ACCOUNTANT"],
    group: "Workspace",
  },
  {
    icon: FileUp,
    label: "Import",
    path: "/app/import/history",
    roles: ["ADMIN", "OPERATIONS_MANAGER", "DISPATCHER"],
    group: "Operations",
  },
  {
    icon: Zap,
    label: "Workflows",
    path: "/app/workflows",
    roles: ["ADMIN", "OPERATIONS_MANAGER"],
    group: "Operations",
  },
  {
    icon: Code2,
    label: "Developer",
    path: "/app/developer",
    roles: ["ADMIN", "OPERATIONS_MANAGER"],
    group: "Workspace",
  },
  {
    icon: Plug,
    label: "Integrations",
    path: "/app/integrations",
    roles: ["ADMIN", "OPERATIONS_MANAGER"],
    group: "Workspace",
  },
  { icon: Settings, label: "Settings", path: "/app/settings", group: "Workspace" },
];

/// Every screen the shell can render, including the ones reachable from the
/// bell or the user menu rather than from the sidebar. Used to resolve the
/// topbar title/breadcrumb for the current route.
export const TITLED_ROUTES = [
  ...DEFAULT_NAV,
  { label: "My Deliveries", path: "/app/my-deliveries" },
  { label: "Notifications", path: "/app/notifications" },
];

export const NAV_GROUP_ORDER: NavItem["group"][] = ["Overview", "Operations", "Finance", "Workspace"];

/// DRIVER has no backend access to Orders/Dispatches/Customers/Drivers/
/// Finance/Reports/AI Assistant at all (see OrdersController etc.) — its
/// nav is deliberately just Overview + My Deliveries + Settings, not the
/// full admin nav with links that would all 403.
///
/// The same reasoning applies within the admin nav: an ACCOUNTANT clicking
/// "Drivers", or a SALES_CRM_MANAGER clicking "Dispatches", used to land on a
/// screen the API refuses to serve them.
export function getNavForRole(role: MembershipRole, isPlatformAdmin: boolean): NavItem[] {
  if (role === "DRIVER") return DRIVER_NAV;
  return DEFAULT_NAV.filter(
    (item) => (!item.roles || item.roles.includes(role)) && (!item.platformAdminOnly || isPlatformAdmin),
  );
}

export function isNavPathActive(pathname: string, path: string): boolean {
  if (path === "/app") {
    return pathname === "/app" || pathname === "/app/";
  }
  return pathname.startsWith(path);
}

/// Longest match wins, so /app/orders/create resolves to "Orders" rather than
/// to the "/app" Overview entry.
export function resolveCurrentPage(pathname: string): { label: string; path: string } | undefined {
  return [...TITLED_ROUTES]
    .sort((a, b) => b.path.length - a.path.length)
    .find((n) => isNavPathActive(pathname, n.path));
}
