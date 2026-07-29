import { createFileRoute, useNavigate, Outlet, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { portalSessionManager, usePortalLogout, usePortalCurrentCustomer } from "@/lib/api/portal-auth";
import { onPortalSessionExpired } from "@/lib/api/portal-session";
import { usePortalUnreadCount } from "@/lib/api/portal-notifications";
import { useSessionGuard } from "@/hooks/use-session-guard";
import {
  LayoutDashboard,
  Package,
  Wallet,
  Bell,
  FileText,
  User,
  Menu,
  LogOut,
  Truck,
  CreditCard,
} from "lucide-react";

export const Route = createFileRoute("/portal")({
  head: () => ({
    meta: [
      { title: "Customer Portal — FlowERP AI" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PortalLayout,
});

const PORTAL_PUBLIC_PATHS = ["/portal/login", "/portal/accept-invite"];

const NAV_ITEMS = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/portal" },
  { icon: Package, label: "Orders", path: "/portal/orders" },
  { icon: Wallet, label: "Invoices", path: "/portal/invoices" },
  { icon: CreditCard, label: "Payments", path: "/portal/payments" },
  { icon: Bell, label: "Notifications", path: "/portal/notifications" },
  { icon: FileText, label: "Documents", path: "/portal/documents" },
  { icon: User, label: "Profile", path: "/portal/profile" },
] as const;

function PortalLayout() {
  const location = useLocation();
  const isPublicPath = PORTAL_PUBLIC_PATHS.includes(location.pathname);

  if (isPublicPath) {
    return <Outlet />;
  }

  return <AuthenticatedPortalShell />;
}

function AuthenticatedPortalShell() {
  const navigate = useNavigate();
  const { logout } = usePortalLogout();
  const location = useLocation();
  const ready = useSessionGuard({
    hasValidSession: () => portalSessionManager.hasValidSession(),
    onExpired: onPortalSessionExpired,
    loginPath: "/portal/login",
    publicPaths: PORTAL_PUBLIC_PATHS,
  });
  const sessionOk = ready && portalSessionManager.hasValidSession();
  const { data: currentCustomer } = usePortalCurrentCustomer({ enabled: sessionOk });
  const { data: unreadData } = usePortalUnreadCount({ enabled: sessionOk });
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  const handleLogout = async () => {
    await logout();
    navigate({ to: "/portal/login", replace: true });
  };

  if (!ready) return null;

  const isActive = (path: string) => {
    if (path === "/portal") {
      return location.pathname === "/portal" || location.pathname === "/portal/";
    }
    return location.pathname.startsWith(path);
  };

  const unreadCount = unreadData?.unreadCount ?? 0;

  const navContent = (onNavigate?: () => void) => (
    <nav className="flex-1 space-y-1 px-3 py-6">
      {NAV_ITEMS.map((n) => {
        const active = isActive(n.path);
        return (
          <button
            key={n.label}
            type="button"
            onClick={() => {
              navigate({ to: n.path });
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
            {n.label === "Notifications" && unreadCount > 0 ? (
              <Badge variant="destructive" className="ml-auto h-5 min-w-5 px-1 text-xs">
                {unreadCount > 99 ? "99+" : unreadCount}
              </Badge>
            ) : null}
          </button>
        );
      })}
    </nav>
  );

  return (
    <div className="flex min-h-dvh bg-background">
      <aside className="fixed left-0 top-0 z-50 hidden h-dvh w-64 flex-col border-r border-brand/10 bg-sidebar md:flex">
        <div className="flex items-center gap-3 border-b border-brand/10 px-6 py-6">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand/10">
            <Truck className="h-4 w-4 text-brand" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">Customer Portal</p>
            {currentCustomer ? (
              <p className="truncate text-xs text-muted-foreground">
                {currentCustomer.customer.companyName}
              </p>
            ) : null}
          </div>
        </div>
        {navContent()}
        <div className="border-t border-brand/10 p-4">
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut className="h-5 w-5" />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="flex w-64 flex-col bg-sidebar p-0">
          <SheetTitle className="sr-only">Portal Navigation</SheetTitle>
          <div className="flex items-center gap-3 border-b border-brand/10 px-6 py-6">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand/10">
              <Truck className="h-4 w-4 text-brand" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">Customer Portal</p>
              {currentCustomer ? (
                <p className="truncate text-xs text-muted-foreground">
                  {currentCustomer.customer.companyName}
                </p>
              ) : null}
            </div>
          </div>
          {navContent(() => setMobileNavOpen(false))}
          <div className="border-t border-brand/10 p-4">
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <LogOut className="h-5 w-5" />
              <span>Sign out</span>
            </button>
          </div>
        </SheetContent>
      </Sheet>

      <main id="main-content" className="flex-1 overflow-auto md:ml-64">
        <div className="sticky top-0 z-40 border-b border-brand/10 bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-8">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileNavOpen(true)}
                className="rounded-lg p-2 text-muted-foreground hover:bg-brand/10 hover:text-brand md:hidden"
                aria-label="Open navigation"
              >
                <Menu className="h-5 w-5" />
              </button>
              <div className="flex items-center gap-2 md:hidden">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand/10">
                  <Truck className="h-4 w-4 text-brand" />
                </div>
                <span className="text-sm font-semibold text-foreground">Customer Portal</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {currentCustomer ? (
                <span className="hidden text-sm text-muted-foreground sm:block">
                  {currentCustomer.customer.companyName}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-8 sm:py-8">
          <div className="mx-auto w-full max-w-[1920px]">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}
