import type { Page } from '@playwright/test';

/** Stable app routes used by regression suites. */
export const ROUTES = {
  signIn: '/login',
  home: '/app',
  customers: '/app/customers',
  orders: '/app/orders',
  dispatches: '/app/dispatches',
  board: '/app/dispatches/board',
  calendar: '/app/dispatches/calendar',
  analytics: '/app/dispatches/analytics',
  finance: '/app/finance',
  notifications: '/app/notifications',
  audit: '/app/audit-logs',
  settings: '/app/settings',
  driver: '/app/driver',
  portalLogin: '/portal/login',
  portalHome: '/portal',
} as const;

export async function gotoApp(page: Page, path: string): Promise<void> {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
}
