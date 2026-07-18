import type { ReactNode } from "react";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { Topbar } from "@/components/layout/topbar";
import { CommandPalette } from "@/components/layout/command-palette";
import { useCommandPalette } from "@/hooks/use-command-palette";
import type { NavItem } from "@/components/layout/nav-config";
import type { CurrentUser } from "@/lib/api/auth";

export function AppShell({
  nav,
  navReady,
  currentUser,
  onSignOut,
  children,
}: {
  nav: NavItem[];
  navReady: boolean;
  currentUser: CurrentUser | null;
  onSignOut: () => void;
  children: ReactNode;
}) {
  const commandPalette = useCommandPalette();

  return (
    <SidebarProvider>
      <AppSidebar nav={nav} navReady={navReady} />
      <SidebarInset>
        <Topbar
          currentUser={currentUser}
          onSignOut={onSignOut}
          onOpenCommandPalette={() => commandPalette.setOpen(true)}
        />

        {/* Page Content — full-bleed with generous gutters. A narrow centred
            column stranded the tables in the middle of wide monitors, which is
            the opposite of what a data-dense ERP wants. The cap only kicks in
            on ultra-wide displays, where unbounded line lengths hurt. */}
        <div className="px-4 py-6 sm:px-8 sm:py-8">
          <div className="mx-auto w-full max-w-[1920px]">{children}</div>
        </div>
      </SidebarInset>

      <CommandPalette open={commandPalette.open} onOpenChange={commandPalette.setOpen} nav={nav} />
    </SidebarProvider>
  );
}
