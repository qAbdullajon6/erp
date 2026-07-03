"use client";

import { usePathname } from "next/navigation";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppTopbar } from "@/components/layout/app-topbar";
import { AccessRestricted } from "@/components/layout/access-restricted";
import { AppDataProvider } from "@/lib/store";
import { RoleProvider, roleAllowedPaths, useRole } from "@/lib/role";
import { NotificationSettingsProvider } from "@/lib/notification-settings";
import { NotificationStateProvider } from "@/lib/notification-state";
import { AiConversationProvider } from "@/lib/ai-conversation";

function RouteGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { role } = useRole();
  const allowed = roleAllowedPaths[role].includes(pathname);

  if (!allowed) return <AccessRestricted role={role} />;
  return <>{children}</>;
}

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppDataProvider>
      <RoleProvider>
        <NotificationSettingsProvider>
          <NotificationStateProvider>
            <AiConversationProvider>
              <div className="flex min-h-screen w-full">
                <AppSidebar />
                <div className="flex flex-1 flex-col min-w-0">
                  <AppTopbar />
                  <main className="flex-1 overflow-y-auto bg-muted/30 p-6">
                    <RouteGuard>{children}</RouteGuard>
                  </main>
                </div>
              </div>
            </AiConversationProvider>
          </NotificationStateProvider>
        </NotificationSettingsProvider>
      </RoleProvider>
    </AppDataProvider>
  );
}
