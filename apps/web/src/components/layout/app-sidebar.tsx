"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  Radar,
  Truck,
  Users,
  Wallet,
  Sparkles,
  BarChart3,
  Bell,
  Boxes,
  MapPinned,
  Menu,
  Settings,
  UserCog,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { roleAllowedPaths, useRole } from "@/lib/role";
import { useDemoGuide } from "@/lib/demo-guide";
import { getDataMode } from "@/lib/data-mode";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const navItems: NavItem[] = [
  { href: "/app", label: "Dashboard", icon: LayoutDashboard },
  { href: "/app/orders", label: "Orders", icon: Package },
  { href: "/app/dispatch", label: "Dispatch Board", icon: Radar },
  { href: "/app/drivers", label: "Drivers & Vehicles", icon: Truck },
  { href: "/app/customers", label: "Customers / CRM", icon: Users },
  { href: "/app/finance", label: "Finance", icon: Wallet },
  { href: "/app/my-deliveries", label: "My Deliveries", icon: MapPinned },
  { href: "/app/ai-assistant", label: "AI Assistant", icon: Sparkles },
  { href: "/app/reports", label: "Reports", icon: BarChart3 },
  { href: "/app/notifications", label: "Notifications", icon: Bell },
];

/// Settings routes (always in connected workspace when API mode is enabled)
const connectedNavItems: NavItem[] = [
  { href: "/app/settings/organization", label: "Organization Settings", icon: Settings },
  { href: "/app/settings/members", label: "Members", icon: UserCog },
];

function SidebarBrand() {
  return (
    <div className="flex items-center gap-2 px-5 h-16 border-b border-sidebar-border">
      <div className="flex size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
        <Boxes className="size-4.5" />
      </div>
      <div className="flex flex-col leading-tight">
        <span className="text-sm font-semibold tracking-tight">FlowERP AI</span>
        <span className="text-[11px] text-sidebar-foreground/50">Logistics Platform</span>
      </div>
      <Badge
        variant="outline"
        className="ml-auto border-sidebar-border text-[10px] text-sidebar-foreground/60"
      >
        Sample Data
      </Badge>
    </div>
  );
}

function NavLinks({
  items,
  pathname,
  onNavigate,
}: {
  items: NavItem[];
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <>
      {items.map((item) => {
        const active = pathname === item.href;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
            )}
          >
            <Icon className="size-4" />
            {item.label}
          </Link>
        );
      })}
    </>
  );
}

function SidebarNavList({
  items,
  connectedItems,
  pathname,
  onNavigate,
}: {
  items: NavItem[];
  connectedItems?: NavItem[];
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
      <NavLinks items={items} pathname={pathname} onNavigate={onNavigate} />
      {connectedItems && connectedItems.length > 0 && (
        <>
          <p className="px-3 pt-3 pb-1 text-[11px] font-medium uppercase tracking-wide text-sidebar-foreground/40">
            Connected Workspace
          </p>
          <NavLinks items={connectedItems} pathname={pathname} onNavigate={onNavigate} />
        </>
      )}
    </nav>
  );
}

function SidebarFooterNote({ onOpenDemoGuide }: { onOpenDemoGuide?: () => void }) {
  const { setOpen } = useDemoGuide();

  return (
    <div className="px-3 py-4 border-t border-sidebar-border">
      <div className="rounded-lg bg-sidebar-accent/60 p-3">
        <p className="text-xs font-medium text-sidebar-accent-foreground">Explore the Demo</p>
        <p className="mt-1 text-[11px] text-sidebar-foreground/50">
          Try role-based workflows, live reports, and local demo intelligence.
        </p>
        <Button
          size="sm"
          variant="secondary"
          className="mt-2 w-full"
          onClick={() => {
            onOpenDemoGuide?.();
            setOpen(true);
          }}
        >
          View Sample Guide
        </Button>
      </div>
    </div>
  );
}

export function AppSidebar() {
  const pathname = usePathname();
  const { role } = useRole();
  const allowed = roleAllowedPaths[role];
  const visibleNavItems = navItems.filter((item) => allowed.includes(item.href));
  const visibleConnectedItems = getDataMode() === "api" ? connectedNavItems : [];

  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
      <SidebarBrand />
      <SidebarNavList
        items={visibleNavItems}
        connectedItems={visibleConnectedItems}
        pathname={pathname}
      />
      <SidebarFooterNote />
    </aside>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  const { role } = useRole();
  const allowed = roleAllowedPaths[role];
  const visibleNavItems = navItems.filter((item) => allowed.includes(item.href));
  const visibleConnectedItems = getDataMode() === "api" ? connectedNavItems : [];
  const [navOpen, setNavOpen] = React.useState(false);

  return (
    <Sheet open={navOpen} onOpenChange={setNavOpen}>
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={() => setNavOpen(true)}
        aria-label="Open navigation menu"
      >
        <Menu className="size-5" />
      </Button>
      <SheetContent
        side="left"
        className="w-72 border-sidebar-border bg-sidebar p-0 text-sidebar-foreground"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Navigation</SheetTitle>
        </SheetHeader>
        <div className="flex h-full flex-col">
          <SidebarBrand />
          <SidebarNavList
            items={visibleNavItems}
            connectedItems={visibleConnectedItems}
            pathname={pathname}
            onNavigate={() => setNavOpen(false)}
          />
          <SidebarFooterNote onOpenDemoGuide={() => setNavOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
