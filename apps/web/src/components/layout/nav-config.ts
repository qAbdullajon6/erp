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
  Satellite,
  Building2,
} from "lucide-react";
import type { MembershipRole } from "@/lib/api/organizations";

/// A screen that hangs off a section rather than earning its own sidebar row.
/// Rendered underneath its parent while that section is open, listed in the
/// command palette always, and resolved for the topbar title like any other
/// route. Relocating a screen here changes where its link appears — never
/// where the route lives, so existing URLs keep working.
export type NavChild = {
  label: string;
  path: string;
  /// Same contract as NavItem.roles — omitted means every role that can see
  /// the parent.
  roles?: MembershipRole[];
  /// Registered only in development builds. Tracking Debug's controller is
  /// mounted behind NODE_ENV=development (TelematicsModule), so linking to it
  /// from a production sidebar is a link to an error page.
  devOnly?: boolean;
};

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
  group: "Overview" | "Operations" | "Fleet" | "Finance" | "Workspace";
  /// Child routes with their own sidebar entry — parent must not stay active.
  activeExcludePrefixes?: string[];
  children?: NavChild[];
};

/// A safety net rather than a rendered menu: DriverAppShell paints its own
/// three-tab bottom bar, so this only matters if a driver session ever reaches
/// the admin shell.
export const DRIVER_NAV: NavItem[] = [
  { icon: LayoutDashboard, label: "Home", path: "/app/driver", group: "Overview" },
  { icon: PackageCheck, label: "Jobs", path: "/app/driver", group: "Overview" },
  { icon: Settings, label: "Settings", path: "/app/settings", group: "Workspace" },
];

/// Read-role sources, for whoever has to keep these honest:
///   Orders      OrdersController.READ_ROLES        — all five
///   Dispatches  DispatchesController.ROLES_READ    — no SALES_CRM_MANAGER
///   Customers   CustomersController.READ_ROLES     — all five
///   Drivers     DriversController.ROLES            — ADMIN/OPS/DISPATCHER
///   Vehicles    VehiclesController.ROLES           — ADMIN/OPS/DISPATCHER
///   Devices     TelematicsDevicesController        — ADMIN/OPS
///   Geofences   GeofencesController (read)         — ADMIN/OPS/DISPATCHER
///   Finance     FinanceController.ROLES            — all five
///   Reports     ReportsController.ROLES            — all five
export const FLEET_ROLES: MembershipRole[] = ["ADMIN", "OPERATIONS_MANAGER", "DISPATCHER"];
const ADMIN_OPS: MembershipRole[] = ["ADMIN", "OPERATIONS_MANAGER"];

/// Eleven top-level destinations, down from twenty-two. The test for whether a
/// screen belongs here is whether a company admin opens it during ordinary
/// operation — configuration and diagnostics hang off the section they
/// belong to instead. Nothing was removed from the product; Integrations was
/// removed from navigation because no /api/admin/integrations controller
/// exists, so every request that screen makes returns 404.
export const DEFAULT_NAV: NavItem[] = [
  { icon: LayoutDashboard, label: "Overview", path: "/app", group: "Overview" },
  { icon: Package, label: "Orders", path: "/app/orders", group: "Operations" },
  {
    icon: RouteIcon,
    label: "Dispatch",
    path: "/app/dispatches",
    roles: ["ADMIN", "OPERATIONS_MANAGER", "DISPATCHER", "ACCOUNTANT"],
    group: "Operations",
    children: [{ label: "Analytics", path: "/app/dispatches/analytics" }],
  },
  { icon: MapPin, label: "Customers", path: "/app/customers", group: "Operations" },
  {
    icon: Satellite,
    label: "Fleet Tracking",
    path: "/app/fleet-tracking",
    roles: FLEET_ROLES,
    group: "Fleet",
    // Everything positional lives under the map: the devices that feed it, the
    // geofences drawn on it, and the diagnostics that explain it.
    children: [
      { label: "Devices", path: "/app/devices", roles: ADMIN_OPS },
      { label: "GPS providers", path: "/app/providers", roles: ADMIN_OPS },
      { label: "Geofences", path: "/app/geofences" },
      { label: "Diagnostics", path: "/app/fleet-tracking/debug", roles: ADMIN_OPS, devOnly: true },
    ],
  },
  { icon: Truck, label: "Vehicles", path: "/app/vehicles", roles: FLEET_ROLES, group: "Fleet" },
  { icon: Users, label: "Drivers", path: "/app/drivers", roles: FLEET_ROLES, group: "Fleet" },
  { icon: Wallet, label: "Finance", path: "/app/finance", group: "Finance" },
  { icon: BarChart3, label: "Reports", path: "/app/reports", group: "Finance" },
  { icon: Sparkles, label: "AI Assistant", path: "/app/ai-assistant", group: "Workspace" },
  {
    icon: Building2,
    label: "Settings",
    path: "/app/settings",
    group: "Workspace",
    // Configuration surfaces that each held a top-level row of their own.
    children: [
      { label: "Billing", path: "/app/billing", roles: ["ADMIN"] },
      { label: "Notifications", path: "/app/notifications" },
      { label: "Data import", path: "/app/import", roles: FLEET_ROLES },
      { label: "Automation", path: "/app/workflows", roles: ADMIN_OPS },
      { label: "Developer", path: "/app/developer", roles: ADMIN_OPS },
      { label: "Activity log", path: "/app/audit-logs", roles: ["ADMIN", "OPERATIONS_MANAGER", "ACCOUNTANT"] },
    ],
  },
];

/// Every screen the shell can render, including the ones reachable from the
/// bell or the user menu rather than from the sidebar. Used to resolve the
/// topbar title/breadcrumb for the current route.
export const TITLED_ROUTES: Array<{ label: string; path: string }> = [
  ...DEFAULT_NAV.flatMap((item) => [
    { label: item.label, path: item.path },
    ...(item.children ?? []).map((child) => ({ label: child.label, path: child.path })),
  ]),
  { label: "Driver Workspace", path: "/app/driver" },
  { label: "My Deliveries", path: "/app/my-deliveries" },
  { label: "Notifications", path: "/app/notifications" },
];

export const NAV_GROUP_ORDER: NavItem["group"][] = [
  "Overview",
  "Operations",
  "Fleet",
  "Finance",
  "Workspace",
];

/// DRIVER has no backend access to Orders/Dispatches/Customers/Drivers/
/// Finance/Reports/AI Assistant at all (see OrdersController etc.) — its
/// nav is deliberately just Overview + My Deliveries + Settings, not the
/// full admin nav with links that would all 403.
///
/// The same reasoning applies within the admin nav: an ACCOUNTANT clicking
/// "Drivers", or a SALES_CRM_MANAGER clicking "Dispatches", used to land on a
/// screen the API refuses to serve them.
export function getNavForRole(
  role: MembershipRole,
  isPlatformAdmin: boolean,
  { devTools = import.meta.env.DEV }: { devTools?: boolean } = {},
): NavItem[] {
  if (role === "DRIVER") return DRIVER_NAV;
  return DEFAULT_NAV.filter(
    (item) => (!item.roles || item.roles.includes(role)) && (!item.platformAdminOnly || isPlatformAdmin),
  ).map((item) =>
    item.children
      ? {
          ...item,
          children: item.children.filter(
            (child) => (!child.roles || child.roles.includes(role)) && (!child.devOnly || devTools),
          ),
        }
      : item,
  );
}

export function isNavPathActive(pathname: string, path: string, excludePrefixes: string[] = []): boolean {
  if (path === "/app") {
    return pathname === "/app" || pathname === "/app/";
  }
  if (!pathname.startsWith(path)) return false;
  if (excludePrefixes.some((prefix) => pathname.startsWith(prefix))) return false;
  return true;
}

/// Whether the route belongs to this section at all — the parent's own path or
/// any child's. Settings' children live outside /app/settings (Billing is at
/// /app/billing), so a prefix test on the parent alone would leave the section
/// collapsed on the very screens it contains.
export function isNavSectionActive(pathname: string, item: NavItem): boolean {
  if (isNavPathActive(pathname, item.path, item.activeExcludePrefixes)) return true;
  return (item.children ?? []).some((child) => isNavPathActive(pathname, child.path));
}

/// Longest match wins, so /app/orders/create resolves to "Orders" rather than
/// to the "/app" Overview entry, and /app/devices resolves to "Devices" rather
/// than to its Fleet Tracking parent.
export function resolveCurrentPage(pathname: string): { label: string; path: string } | undefined {
  return [...TITLED_ROUTES]
    .sort((a, b) => b.path.length - a.path.length)
    .find((n) => isNavPathActive(pathname, n.path));
}
