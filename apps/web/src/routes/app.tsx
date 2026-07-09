import { createFileRoute, useNavigate, Link, Outlet, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Logo, LogoMark } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { sessionManager, useLogout } from "@/lib/api/auth";
import {
  LayoutDashboard,
  Package,
  Route as RouteIcon,
  MapPin,
  Truck,
  Wallet,
  Sparkles,
  LogOut,
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

function AppShell() {
  const navigate = useNavigate();
  const { logout } = useLogout();
  const [ready, setReady] = useState(false);
  const location = useLocation();

  useEffect(() => {
    if (!sessionManager.hasValidSession()) {
      navigate({ to: "/auth/sign-in", replace: true });
    } else {
      setReady(true);
    }
  }, [navigate]);

  const handleLogout = async () => {
    await logout();
    navigate({ to: "/auth/sign-in", replace: true });
  };

  if (!ready) return null;

  const nav = [
    { icon: LayoutDashboard, label: "Overview", path: "/app" },
    { icon: Package, label: "Orders", path: "/app/orders" },
    { icon: RouteIcon, label: "Dispatches", path: "/app/dispatches" },
    { icon: MapPin, label: "Customers", path: "/app/customers" },
    { icon: Truck, label: "Drivers", path: "/app/drivers" },
    { icon: Wallet, label: "Finance", path: "/app/finance" },
    { icon: Sparkles, label: "AI Assistant", path: "/app/ai-assistant" },
  ];

  const isActive = (path: string) => {
    if (path === "/app") {
      return location.pathname === "/app" || location.pathname === "/app/";
    }
    return location.pathname.startsWith(path);
  };

  return (
    <div className="flex min-h-screen bg-background">
      {/* Fixed Sidebar */}
      <aside className="fixed left-0 top-0 z-50 hidden h-screen w-64 flex-col border-r border-brand/10 bg-sidebar md:flex">
        {/* Logo Section */}
        <div className="border-b border-brand/10 px-6 py-6">
          <Link to="/" className="flex items-center gap-3">
            <LogoMark size={32} />
            <span className="font-display text-base font-semibold">FlowERP<span className="text-brand"> AI</span></span>
          </Link>
        </div>

        {/* Navigation Section */}
        <nav className="flex-1 space-y-2 overflow-y-auto px-3 py-6">
          {nav.map((n) => {
            const active = isActive(n.path);
            return (
              <button
                key={n.label}
                onClick={() => navigate({ to: n.path as any })}
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

        {/* Sign Out Section */}
        <div className="border-t border-brand/10 px-3 py-4">
          <Button
            onClick={handleLogout}
            className="w-full justify-start gap-3 rounded-lg bg-destructive/10 px-4 py-3 font-medium text-destructive hover:bg-destructive/20"
          >
            <LogOut className="h-5 w-5" />
            Sign out
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="ml-64 flex-1 overflow-auto">
        {/* Top Bar */}
        <div className="sticky top-0 z-40 border-b border-brand/10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex h-16 items-center justify-between px-8">
            <Logo showWordmark={false} className="md:hidden" />
            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground">Welcome back</span>
            </div>
          </div>
        </div>

        {/* Page Content */}
        <div className="p-8">
          <div className="mx-auto max-w-7xl">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}
