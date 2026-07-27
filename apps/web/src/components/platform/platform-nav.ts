import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Building2,
  Inbox,
  CreditCard,
  LifeBuoy,
  BarChart3,
  Server,
  Shield,
  Settings,
} from 'lucide-react';

export type PlatformNavItem = {
  icon: LucideIcon;
  label: string;
  path: string;
};

/// Platform Console sidebar — EXACT order and paths required by the console.
export const PLATFORM_NAV: PlatformNavItem[] = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/platform' },
  { icon: Building2, label: 'Organizations', path: '/platform/organizations' },
  { icon: Inbox, label: 'Leads', path: '/platform/leads' },
  { icon: CreditCard, label: 'Subscriptions', path: '/platform/subscriptions' },
  { icon: LifeBuoy, label: 'Support', path: '/platform/support' },
  { icon: BarChart3, label: 'Analytics', path: '/platform/analytics' },
  { icon: Server, label: 'System', path: '/platform/system' },
  { icon: Shield, label: 'Audit', path: '/platform/audit' },
  { icon: Settings, label: 'Settings', path: '/platform/settings' },
];

export function isPlatformNavPathActive(pathname: string, path: string): boolean {
  if (path === '/platform') {
    return pathname === '/platform' || pathname === '/platform/';
  }
  return pathname.startsWith(path);
}

export function resolvePlatformPage(pathname: string): PlatformNavItem | undefined {
  return [...PLATFORM_NAV]
    .sort((a, b) => b.path.length - a.path.length)
    .find((n) => isPlatformNavPathActive(pathname, n.path));
}
