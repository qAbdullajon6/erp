import type { ReactNode } from 'react';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { PlatformSidebar } from '@/components/platform/platform-sidebar';
import { PlatformTopbar } from '@/components/platform/platform-topbar';
import type { CurrentUser } from '@/lib/api/auth';

export function PlatformShell({
  currentUser,
  onSignOut,
  children,
}: {
  currentUser: CurrentUser | null;
  onSignOut: () => void;
  children: ReactNode;
}) {
  return (
    <SidebarProvider>
      <PlatformSidebar />
      <SidebarInset id="main-content">
        <PlatformTopbar currentUser={currentUser} onSignOut={onSignOut} />
        <div className="px-3 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8 overflow-x-hidden">
          <div className="mx-auto w-full max-w-[1920px] min-w-0">{children}</div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
