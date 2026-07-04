"use client";

import { usePathname } from "next/navigation";
import { Info } from "lucide-react";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppTopbar } from "@/components/layout/app-topbar";
import { AccessRestricted } from "@/components/layout/access-restricted";
import { AppDataProvider } from "@/lib/store";
import { RoleProvider, roleAllowedPaths, useRole } from "@/lib/role";
import { NotificationSettingsProvider } from "@/lib/notification-settings";
import { NotificationStateProvider } from "@/lib/notification-state";
import { AiConversationProvider } from "@/lib/ai-conversation";
import { DemoGuideProvider } from "@/lib/demo-guide";
import { getDataMode } from "@/lib/data-mode";

/// Only shown when NEXT_PUBLIC_DATA_MODE=api, on every page except the ones
/// that already have their own Connected Mode UI/badges (/customers,
/// /orders, /dispatch, /finance, /settings/*) — a plain-text reminder that
/// everything else is still the localStorage demo, so a Connected Mode user
/// isn't misled into thinking Reports/Notifications/AI Assistant are live.
/// Renders nothing at all in demo mode, so demo mode's pages are unaffected
/// pixel-for-pixel.
const CONNECTED_MODE_PATHS = ["/customers", "/orders", "/dispatch", "/finance"];

function ModuleDataModeBanner({ pathname }: { pathname: string }) {
  if (getDataMode() !== "api") return null;
  if (CONNECTED_MODE_PATHS.includes(pathname) || pathname.startsWith("/settings")) return null;

  return (
    <div className="mb-4 flex items-center gap-2 rounded-md border border-dashed border-muted-foreground/30 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
      <Info className="size-3.5 shrink-0" />
      This module is running on local demo data (browser localStorage) — Connected Mode currently
      covers Customers, Orders, Dispatch, and Finance. It hasn&apos;t moved to the live API yet.
    </div>
  );
}

function RouteGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { role } = useRole();

  // /settings/* is Connected Mode-only and governed by the real API session's
  // role (see components/layout/protected-api-route.tsx), not the demo role
  // switcher — it deliberately isn't part of any demo role's allowed paths.
  if (pathname.startsWith("/settings")) return <>{children}</>;

  const allowed = roleAllowedPaths[role].includes(pathname);
  if (!allowed) return <AccessRestricted role={role} />;
  return <>{children}</>;
}

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <AppDataProvider>
      <RoleProvider>
        <NotificationSettingsProvider>
          <NotificationStateProvider>
            <AiConversationProvider>
              <DemoGuideProvider>
                <div className="flex min-h-screen w-full">
                  <AppSidebar />
                  <div className="flex flex-1 flex-col min-w-0">
                    <AppTopbar />
                    <main className="flex-1 overflow-y-auto bg-muted/30 p-6">
                      <ModuleDataModeBanner pathname={pathname} />
                      <RouteGuard>{children}</RouteGuard>
                    </main>
                  </div>
                </div>
              </DemoGuideProvider>
            </AiConversationProvider>
          </NotificationStateProvider>
        </NotificationSettingsProvider>
      </RoleProvider>
    </AppDataProvider>
  );
}
