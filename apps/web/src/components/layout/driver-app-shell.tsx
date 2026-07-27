'use client';

import type { ReactNode } from 'react';
import { Link, useRouterState } from '@tanstack/react-router';
import { LayoutDashboard, LogOut, PackageCheck, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CurrentUser } from '@/lib/api/auth';

const TABS = [
  { to: '/app', label: 'Home', icon: LayoutDashboard, exact: true },
  { to: '/app/my-deliveries', label: 'Jobs', icon: PackageCheck, exact: false },
  { to: '/app/settings', label: 'Account', icon: Settings, exact: false },
] as const;

export function DriverAppShell({
  currentUser,
  onSignOut,
  children,
}: {
  currentUser: CurrentUser | null;
  onSignOut: () => void;
  children: ReactNode;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const firstName = currentUser?.user.firstName ?? 'Driver';

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-30 border-b border-border/80 bg-surface/95 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{firstName}</p>
            <p className="text-xs text-muted-foreground">Driver portal</p>
          </div>
          <button
            type="button"
            onClick={onSignOut}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-muted-foreground hover:text-foreground"
            aria-label="Sign out"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
        </div>
      </header>

      <main
        id="main-content"
        className="mx-auto w-full max-w-lg flex-1 px-4 py-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))]"
      >
        {children}
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
        aria-label="Driver navigation"
      >
        <div className="mx-auto grid max-w-lg grid-cols-3">
          {TABS.map((tab) => {
            const active = tab.exact ? pathname === tab.to : pathname === tab.to || pathname.startsWith(`${tab.to}/`);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.to}
                to={tab.to}
                className={cn(
                  'flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors',
                  active ? 'text-brand' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className={cn('h-5 w-5', active && 'text-brand')} aria-hidden />
                {tab.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
