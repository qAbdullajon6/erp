import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
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
    { icon: LayoutDashboard, label: "Overview", active: true },
    { icon: Package, label: "Orders" },
    { icon: RouteIcon, label: "Dispatch" },
    { icon: MapPin, label: "Tracking" },
    { icon: Truck, label: "Fleet" },
    { icon: Wallet, label: "Finance" },
    { icon: Sparkles, label: "AI Assistant" },
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
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                n.active
                  ? "bg-brand/15 text-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
              }`}
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

      <main className="flex-1 p-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">Command Center</h1>
            <p className="mt-1 text-sm text-muted-foreground">Welcome back — here's your operations at a glance.</p>
          </div>
          <Logo showWordmark={false} className="md:hidden" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { l: "Orders today", v: "1,284", d: "+12%" },
            { l: "Active fleet", v: "86 / 92", d: "94%" },
            { l: "On-time rate", v: "97.4%", d: "+2.1%" },
            { l: "Revenue (wk)", v: "$482K", d: "+8.6%" },
          ].map((k) => (
            <div key={k.l} className="rounded-xl border border-border/60 bg-surface/60 p-5">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">{k.l}</div>
              <div className="mt-2 font-display text-2xl font-bold">{k.v}</div>
              <div className="text-xs text-success">{k.d}</div>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-xl border border-border/60 bg-surface/60 p-6">
          <div className="text-sm text-muted-foreground">
            Your workspace is ready. Connect Lovable Cloud to enable real accounts, data, and the AI assistant.
          </div>
        </div>
      </main>
    </div>
  );
}
