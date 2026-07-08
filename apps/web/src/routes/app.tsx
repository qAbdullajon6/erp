import { createFileRoute, useNavigate, Link, Outlet } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Logo, LogoMark } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { isAuthenticated, signOutLocal } from "@/lib/auth";
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
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isAuthenticated()) {
      navigate({ to: "/auth/sign-in", replace: true });
    } else {
      setReady(true);
    }
  }, [navigate]);

  if (!ready) return null;

  const nav = [
    { icon: LayoutDashboard, label: "Overview", path: "/app" },
    { icon: Package, label: "Orders", path: "/app/orders" },
    { icon: RouteIcon, label: "Dispatch", path: "/app/dispatch" },
    { icon: MapPin, label: "Customers", path: "/app/customers" },
    { icon: Truck, label: "Drivers", path: "/app/drivers" },
    { icon: Wallet, label: "Finance", path: "/app/finance" },
    { icon: Sparkles, label: "AI Assistant", path: "/app/ai-assistant" },
  ];

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border/60 bg-sidebar p-4 md:flex">
        <Link to="/" className="mb-6 flex items-center gap-2 px-1">
          <LogoMark size={28} />
          <span className="font-display text-sm font-bold">FlowERP<span className="text-brand"> AI</span></span>
        </Link>
        <nav className="space-y-1">
          {nav.map((n) => (
            <button
              key={n.label}
              onClick={() => navigate({ to: n.path as any })}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
            >
              <n.icon className="h-4 w-4" />
              {n.label}
            </button>
          ))}
        </nav>
        <div className="mt-auto">
          <Button
            variant="ghost"
            onClick={() => {
              signOutLocal();
              navigate({ to: "/auth/sign-in", replace: true });
            }}
            className="w-full justify-start text-muted-foreground hover:text-foreground"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </Button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <div className="min-h-screen p-8">
          <div className="mb-8 flex items-center justify-between">
            <Logo showWordmark={false} className="md:hidden" />
          </div>
          <div className="mx-auto">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}
