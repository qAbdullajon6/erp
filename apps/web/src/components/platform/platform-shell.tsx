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
        <div className="px-4 py-6 sm:px-8 sm:py-8">
          <div className="mx-auto w-full max-w-[1920px]">{children}</div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
