import { useLocation } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { UserMenu } from "@/components/layout/user-menu";
import { resolveCurrentPage } from "@/components/layout/nav-config";
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
  const currentPage = resolveCurrentPage(location.pathname);

  return (
    <div className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <SidebarTrigger />
          <Logo showWordmark={false} className="md:hidden" />
          {/* Which screen you're on: the sidebar highlight is off-canvas on
              mobile, and on desktop it's easy to lose at a glance. */}
          <Breadcrumb className="hidden md:block">
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage className="font-display text-lg font-semibold text-foreground">
                  {currentPage?.label ?? "Overview"}
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>

        <div className="flex items-center gap-1 sm:gap-3">
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
          <NotificationBell />
          <div className="mx-1 hidden h-6 w-px bg-border sm:block" />
          <UserMenu currentUser={currentUser} onSignOut={onSignOut} />
        </div>
      </div>
    </div>
  );
}
