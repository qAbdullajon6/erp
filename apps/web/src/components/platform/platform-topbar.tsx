import { useEffect, useState } from 'react';
import { useLocation } from '@tanstack/react-router';
import { Search } from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { Button } from '@/components/ui/button';
import { SidebarTrigger } from '@/components/ui/sidebar';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from '@/components/ui/breadcrumb';
import { PlatformNotificationBell } from '@/components/platform/platform-notification-bell';
import { PlatformSearchDialog } from '@/components/platform/platform-search-dialog';
import { PlatformUserMenu } from '@/components/platform/platform-user-menu';
import { resolvePlatformPage } from '@/components/platform/platform-nav';
import type { CurrentUser } from '@/lib/api/auth';

export function PlatformTopbar({
  currentUser,
  onSignOut,
}: {
  currentUser: CurrentUser | null;
  onSignOut: () => void;
}) {
  const location = useLocation();
  const currentPage = resolvePlatformPage(location.pathname);
  const [searchOpen, setSearchOpen] = useState(false);

  // ⌘K / Ctrl+K must open the Platform search dialog (not a bare text cursor
  // and not the tenant command palette — PlatformShell never mounts that).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'k' || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      setSearchOpen((open) => !open);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <div className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-14 items-center justify-between gap-2 px-3 sm:h-16 sm:gap-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <SidebarTrigger />
            <Logo showWordmark={false} className="md:hidden" />
            <Breadcrumb className="hidden min-w-0 md:block">
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbPage className="truncate font-display text-base font-semibold text-foreground lg:text-lg">
                    {currentPage?.label ?? 'Platform'}
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>

          <div className="flex shrink-0 items-center gap-1 sm:gap-2 lg:gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSearchOpen(true)}
              className="hidden gap-2 text-muted-foreground md:flex"
            >
              <Search className="h-3.5 w-3.5" />
              <span>Search</span>
              <kbd className="ml-2 hidden rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium lg:inline">
                ⌘K
              </kbd>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSearchOpen(true)}
              className="md:hidden"
              aria-label="Search"
            >
              <Search className="h-5 w-5" />
            </Button>
            <PlatformNotificationBell />
            <div className="mx-1 hidden h-6 w-px bg-border sm:block" />
            <PlatformUserMenu currentUser={currentUser} onSignOut={onSignOut} />
          </div>
        </div>
      </div>

      <PlatformSearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  );
}
