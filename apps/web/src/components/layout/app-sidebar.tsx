import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { LogoMark, Wordmark } from "@/components/brand/Logo";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
} from "@/components/ui/sidebar";
import { NAV_GROUP_ORDER, isNavPathActive, type NavItem } from "@/components/layout/nav-config";
import { cn } from "@/lib/utils";

export function AppSidebar({ nav, navReady }: { nav: NavItem[]; navReady: boolean }) {
  const navigate = useNavigate();
  const location = useLocation();

  const groups = NAV_GROUP_ORDER.map((group) => ({
    group,
    items: nav.filter((item) => item.group === group),
  })).filter((g) => g.items.length > 0);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <Link to="/" className="flex items-center gap-3 px-2 py-2 group-data-[collapsible=icon]:justify-center">
          <LogoMark size={28} />
          <span className="group-data-[collapsible=icon]:hidden">
            <Wordmark />
          </span>
        </Link>
      </SidebarHeader>
      <SidebarContent className="scrollbar-thin gap-1">
        {/* The nav depends on the role, so hold a skeleton until /auth/me lands
            rather than painting the role-agnostic links and having the rest
            pop in a moment later. */}
        {!navReady && (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {Array.from({ length: 8 }).map((_, i) => (
                  <SidebarMenuItem key={i}>
                    <SidebarMenuSkeleton showIcon />
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {navReady &&
          groups.map(({ group, items }) => {
            // A group the current route lives in always opens, even if the
            // user collapsed it earlier — landing on a page and not seeing
            // its own nav item highlighted anywhere would be more confusing
            // than the group re-expanding under you.
            const containsActive = items.some((item) => isNavPathActive(location.pathname, item.path));
            return (
              <NavGroup key={group} label={group} defaultOpen={containsActive || true}>
                {items.map((item) => {
                  const active = isNavPathActive(location.pathname, item.path);
                  return (
                    <SidebarMenuItem key={item.path}>
                      <SidebarMenuButton
                        isActive={active}
                        tooltip={item.label}
                        onClick={() => navigate({ to: item.path as any })}
                        className={cn(
                          "relative transition-colors duration-150",
                          "before:absolute before:left-0 before:top-1/2 before:h-0 before:w-0.5 before:-translate-y-1/2 before:rounded-full before:bg-sidebar-primary before:transition-all before:duration-200",
                          "data-[active=true]:font-semibold data-[active=true]:text-sidebar-primary data-[active=true]:before:h-5",
                          "[&>svg]:transition-colors [&>svg]:duration-150 data-[active=true]:[&>svg]:text-sidebar-primary",
                        )}
                      >
                        <item.icon />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </NavGroup>
            );
          })}
      </SidebarContent>
    </Sidebar>
  );
}

function NavGroup({
  label,
  defaultOpen,
  children,
}: {
  label: string;
  defaultOpen: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="group/nav-group">
      <SidebarGroup>
        <CollapsibleTrigger asChild>
          <SidebarGroupLabel className="cursor-pointer select-none justify-between text-[10.5px] font-semibold uppercase tracking-wider text-sidebar-foreground/50 transition-colors hover:text-sidebar-foreground/80 group-data-[collapsible=icon]:hidden">
            {label}
            <ChevronRight className="h-3.5 w-3.5 shrink-0 transition-transform duration-200 group-data-[state=open]/nav-group:rotate-90" />
          </SidebarGroupLabel>
        </CollapsibleTrigger>
        <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
          <SidebarGroupContent>
            <SidebarMenu>{children}</SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
}
