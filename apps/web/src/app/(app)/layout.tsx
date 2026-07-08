"use client";

import { ReactNode } from "react";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppTopbar } from "@/components/layout/app-topbar";
import { NotificationSettingsProvider } from "@/lib/notification-settings";
import { NotificationStateProvider } from "@/lib/notification-state";
import { AiConversationProvider } from "@/lib/ai-conversation";

export default function AppLayout({ children }: { children: ReactNode }) {

  return (
    <NotificationSettingsProvider>
      <NotificationStateProvider>
        <AiConversationProvider>
          <div className="flex min-h-screen w-full">
            <AppSidebar />
            <div className="flex flex-1 flex-col min-w-0">
              <AppTopbar />
              <main className="flex-1 overflow-y-auto bg-muted/30 p-6">
                {children}
              </main>
            </div>
          </div>
        </AiConversationProvider>
      </NotificationStateProvider>
    </NotificationSettingsProvider>
  );
}
