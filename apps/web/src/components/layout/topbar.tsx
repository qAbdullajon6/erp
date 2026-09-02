import { Link, useLocation } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { SupportButton } from "@/components/support/support-drawer";
import { UserMenu } from "@/components/layout/user-menu";
import { resolveBreadcrumbTrail } from "@/components/layout/nav-config";
import { usePageLeaf } from "@/lib/page-title-context";
import type { CurrentUser } from "@/lib/api/auth";

export function Topbar({
  currentUser,
  onSignOut,
  onOpenCommandPalette,
}: {
  currentUser: CurrentUser | null;
  onSignOut: () => void;
  onOpenCommandPalette: () => void;
}) {
  const location = useLocation();
  const trail = resolveBreadcrumbTrail(location.pathname);
  const contextLeaf = usePageLeaf();
  const leaf = contextLeaf
    ? { label: contextLeaf, path: location.pathname }
    : trail.at(-1);

  return (
    <div className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <SidebarTrigger />
          {/* Below lg the sidebar is a drawer, so its logo is off-canvas and this
              is the only mark on screen. */}
          <Logo showWordmark={false} className="shrink-0 lg:hidden" />
          {/* Which screen you're on: the sidebar highlight is off-canvas on
              mobile, and on desktop it's easy to lose at a glance. Nested
              screens also show the section above them — several of them live on
              a path that does not contain their parent (Devices is at
              /app/devices), so this is the only place that relationship is
              stated, and the only way back up in one click. */}
          <Breadcrumb className="hidden min-w-0 md:block">
            <BreadcrumbList className="flex-nowrap">
              {(trail.length > 1 || contextLeaf) ? (
                <>
                  <BreadcrumbItem>
                    <BreadcrumbLink asChild>
                      <Link
                        to={trail[0]!.path}
                        className="whitespace-nowrap text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {trail[0]!.label}
                      </Link>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                </>
              ) : null}
              <BreadcrumbItem className="min-w-0">
                <BreadcrumbPage className="truncate font-display text-lg font-semibold text-foreground">
                  {leaf?.label ?? "Overview"}
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>

        <div className="flex shrink-0 items-center gap-1 sm:gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenCommandPalette}
            className="hidden gap-2 text-muted-foreground sm:flex"
          >
            <Search className="h-3.5 w-3.5" />
            <span>Search</span>
            <kbd className="ml-2 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium">
              ⌘K
            </kbd>
          </Button>
          <Button variant="ghost" size="icon" onClick={onOpenCommandPalette} className="sm:hidden" aria-label="Search">
            <Search className="h-5 w-5" />
          </Button>
          <SupportButton />
          <NotificationBell />
          <div className="mx-1 hidden h-6 w-px bg-border sm:block" />
          <UserMenu currentUser={currentUser} onSignOut={onSignOut} />
        </div>
      </div>
    </div>
  );
}
