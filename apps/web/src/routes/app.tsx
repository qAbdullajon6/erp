import { createFileRoute, useNavigate, Link, Outlet, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Logo, LogoMark, Wordmark } from "@/components/brand/Logo";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { UserMenu } from "@/components/layout/user-menu";
import { sessionManager, useLogout, useCurrentUser } from "@/lib/api/auth";
import type { MembershipRole } from "@/lib/api/organizations";
import {
  LayoutDashboard,
  Package,
  Route as RouteIcon,
  MapPin,
  Truck,
  Wallet,
  Sparkles,
  Menu,
  Settings,
  BarChart3,
  PackageCheck,
  Users,
  Inbox,
} from "lucide-react";

export const Route = createFileRoute("/app")({
  head: () => ({
    meta: [
      { title: "Command Center — FlowERP AI" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AppShell,
});

type NavItem = {
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
};

const DRIVER_NAV: NavItem[] = [
  { icon: LayoutDashboard, label: "Overview", path: "/app" },
  { icon: PackageCheck, label: "My Deliveries", path: "/app/my-deliveries" },
  { icon: Settings, label: "Settings", path: "/app/settings" },
];

/// Read-role sources, for whoever has to keep these honest:
///   Orders      OrdersController.READ_ROLES        — all five
///   Dispatches  DispatchesController.ROLES_READ    — no SALES_CRM_MANAGER
///   Customers   CustomersController.READ_ROLES     — all five
///   Drivers     DriversController.ROLES            — ADMIN/OPS/DISPATCHER
///   Vehicles    VehiclesController.ROLES           — ADMIN/OPS/DISPATCHER
///   Finance     FinanceController.ROLES            — all five
///   Reports     ReportsController.ROLES            — all five
const FLEET_ROLES: MembershipRole[] = ["ADMIN", "OPERATIONS_MANAGER", "DISPATCHER"];

const DEFAULT_NAV: NavItem[] = [
  { icon: LayoutDashboard, label: "Overview", path: "/app" },
  { icon: Package, label: "Orders", path: "/app/orders" },
  {
    icon: RouteIcon,
    label: "Dispatches",
    path: "/app/dispatches",
    roles: ["ADMIN", "OPERATIONS_MANAGER", "DISPATCHER", "ACCOUNTANT"],
  },
  { icon: MapPin, label: "Customers", path: "/app/customers" },
  { icon: Users, label: "Drivers", path: "/app/drivers", roles: FLEET_ROLES },
  // Vehicles had routes, a list, a detail page and a create form, and no way
  // in: nothing anywhere linked to /app/vehicles.
  { icon: Truck, label: "Vehicles", path: "/app/vehicles", roles: FLEET_ROLES },
  { icon: Wallet, label: "Finance", path: "/app/finance" },
  { icon: BarChart3, label: "Reports", path: "/app/reports" },
  // Demo requests from the marketing site. They belong to FlowERP, not to any
  // customer organization, so no MembershipRole can reach them.
  { icon: Inbox, label: "Leads", path: "/app/leads", platformAdminOnly: true },
  { icon: Sparkles, label: "AI Assistant", path: "/app/ai-assistant" },
  { icon: Settings, label: "Settings", path: "/app/settings" },
];

/// Every screen the shell can render, including the ones reachable from the
/// bell or the user menu rather than from the sidebar.
const TITLED_ROUTES = [
  ...DEFAULT_NAV,
  { label: "My Deliveries", path: "/app/my-deliveries" },
  { label: "Notifications", path: "/app/notifications" },
];

function AppShell() {
  const navigate = useNavigate();
  const { logout } = useLogout();
  const { data: currentUser } = useCurrentUser();
  const [ready, setReady] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    if (!sessionManager.hasValidSession()) {
      navigate({ to: "/auth/sign-in", replace: true });
    } else {
      setReady(true);
    }
  }, [navigate]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  const handleLogout = async () => {
    await logout();
    navigate({ to: "/auth/sign-in", replace: true });
  };

  if (!ready) return null;

  // DRIVER has no backend access to Orders/Dispatches/Customers/Drivers/
  // Finance/Reports/AI Assistant at all (see OrdersController etc.) — its
  // nav is deliberately just Overview + My Deliveries + Settings, not the
  // full admin nav with links that would all 403.
  //
  // The same reasoning applies within the admin nav: an ACCOUNTANT clicking
  // "Drivers", or a SALES_CRM_MANAGER clicking "Dispatches", used to land on a
  // screen the API refuses to serve them.
  const role = (currentUser?.membership.role ?? "") as MembershipRole;
  const isPlatformAdmin = currentUser?.user.isPlatformAdmin === true;
  const nav =
    role === "DRIVER"
      ? DRIVER_NAV
      : DEFAULT_NAV.filter(
          (item) =>
            (!item.roles || item.roles.includes(role)) && (!item.platformAdminOnly || isPlatformAdmin),
        );

  const isActive = (path: string) => {
    if (path === "/app") {
      return location.pathname === "/app" || location.pathname === "/app/";
    }
    return location.pathname.startsWith(path);
  };

  // Longest match wins, so /app/orders/create resolves to "Orders" rather than
  // to the "/app" Overview entry. Notifications and My Deliveries are reachable
  // without a sidebar entry for every role, so the title comes from a list that
  // includes them — searching `nav` alone had every one of those screens
  // labelled "Overview".
  const currentPage = [...TITLED_ROUTES]
    .sort((a, b) => b.path.length - a.path.length)
    .find((n) => isActive(n.path));

  // Sign out lives in the header's user menu, next to the account it signs out
  // of — not duplicated at the foot of the sidebar.
  const navContent = (onNavigate?: () => void) => (
    <>
      <nav className="flex-1 space-y-2 overflow-y-auto px-3 py-6">
        {/* The nav depends on the role, so hold a skeleton until /auth/me lands
            rather than painting the role-agnostic links and having the rest
            pop in a moment later. */}
        {!currentUser &&
          Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-11 animate-pulse rounded-lg bg-brand/5" />
          ))}

        {currentUser &&
          nav.map((n) => {
            const active = isActive(n.path);
            return (
              <button
                key={n.label}
                onClick={() => {
                  navigate({ to: n.path as any });
                  onNavigate?.();
                }}
                className={`group flex w-full items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-all duration-200 ${
                  active
                    ? "bg-brand/20 text-brand"
                    : "text-muted-foreground hover:bg-brand/10 hover:text-brand"
                }`}
              >
                <n.icon className="h-5 w-5 transition-transform group-hover:scale-110" />
                <span>{n.label}</span>
              </button>
            );
          })}
      </nav>
    </>
  );

  return (
    <div className="flex min-h-screen bg-background">
      {/* Fixed Sidebar (desktop) */}
      <aside className="fixed left-0 top-0 z-50 hidden h-screen w-64 flex-col border-r border-brand/10 bg-sidebar md:flex">
        <div className="border-b border-brand/10 px-6 py-6">
          <Link to="/" className="flex items-center gap-3">
            <LogoMark size={32} />
            <Wordmark />
          </Link>
        </div>
        {navContent()}
      </aside>

      {/* Mobile nav drawer */}
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="flex w-64 flex-col bg-sidebar p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="border-b border-brand/10 px-6 py-6">
            <Link to="/" className="flex items-center gap-3" onClick={() => setMobileNavOpen(false)}>
              <LogoMark size={32} />
              <Wordmark />
            </Link>
          </div>
          {navContent(() => setMobileNavOpen(false))}
        </SheetContent>
      </Sheet>

      {/* Main Content */}
      <main className="flex-1 overflow-auto md:ml-64">
        {/* Top Bar */}
        <div className="sticky top-0 z-40 border-b border-brand/10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <button
                onClick={() => setMobileNavOpen(true)}
                className="rounded-lg p-2 text-muted-foreground hover:bg-brand/10 hover:text-brand md:hidden"
                aria-label="Open navigation"
              >
                <Menu className="h-5 w-5" />
              </button>
              <Logo showWordmark={false} className="md:hidden" />
              {/* Which screen you're on: the sidebar highlight is off-canvas on
                  mobile, and on desktop it's easy to lose at a glance. */}
              <h2 className="hidden truncate font-display text-lg font-semibold text-foreground md:block">
                {currentPage?.label ?? "Overview"}
              </h2>
            </div>

            <div className="flex items-center gap-1 sm:gap-3">
              <NotificationBell />
              <div className="mx-1 hidden h-6 w-px bg-brand/10 sm:block" />
              <UserMenu currentUser={currentUser} onSignOut={handleLogout} />
            </div>
          </div>
        </div>

        {/* Page Content — full-bleed with generous gutters. A narrow centred
            column stranded the tables in the middle of wide monitors, which is
            the opposite of what a data-dense ERP wants. The cap only kicks in
            on ultra-wide displays, where unbounded line lengths hurt. */}
        <div className="px-4 py-6 sm:px-8 sm:py-8">
          <div className="mx-auto w-full max-w-[1920px]">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}
