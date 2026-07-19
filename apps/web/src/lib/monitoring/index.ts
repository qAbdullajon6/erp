/**
 * Client-side monitoring: error tracking + Web Vitals performance reporting.
 *
 * Error tracking is Sentry-ready without hard-coupling to Sentry: we forward
 * captured errors to (a) the analytics pipeline as an `app_error` event, (b) the
 * Lovable platform hook if present, and (c) `window.Sentry` if a Sentry SDK has
 * been initialised on the page. To turn on Sentry in production, set
 * `VITE_SENTRY_DSN` and initialise the SDK in the app shell — this module will
 * automatically start forwarding to it. No other code changes are required.
 *
 * Web Vitals are collected with the native Performance APIs (no dependency) and
 * reported once per metric to analytics, where GA4/GTM turn them into Core Web
 * Vitals reports.
 */

import { analytics } from '@/lib/analytics';
import { reportLovableError } from '@/lib/lovable-error-reporting';

declare global {
  interface Window {
    Sentry?: { captureException?: (error: unknown, context?: unknown) => void };
  }
}

let started = false;

function forwardToSentry(error: unknown, context: Record<string, unknown>): void {
  try {
    window.Sentry?.captureException?.(error, { extra: context });
  } catch {
    /* never let monitoring throw */
  }
}

export function captureError(error: unknown, context: Record<string, unknown> = {}): void {
  const message = error instanceof Error ? error.message : String(error);
  const source = (context.source as string) ?? 'manual';

  try {
    analytics.track({ name: 'app_error', params: { message: message.slice(0, 300), source } });
  } catch {
    /* analytics may not be ready */
  }
  reportLovableError(error, context);
  forwardToSentry(error, context);
}

/** Sentry-ready flag, so callers/audits can see whether a DSN is configured. */
export const sentryConfigured = Boolean(import.meta.env.VITE_SENTRY_DSN);

// ── Web Vitals ──────────────────────────────────────────────────────────────

type VitalName = 'LCP' | 'CLS' | 'INP' | 'FCP' | 'TTFB';

const THRESHOLDS: Record<VitalName, [number, number]> = {
  LCP: [2500, 4000],
  CLS: [0.1, 0.25],
  INP: [200, 500],
  FCP: [1800, 3000],
  TTFB: [800, 1800],
};

function rate(name: VitalName, value: number): 'good' | 'needs-improvement' | 'poor' {
  const [good, poor] = THRESHOLDS[name];
  if (value <= good) return 'good';
  if (value <= poor) return 'needs-improvement';
  return 'poor';
}

const reported = new Set<VitalName>();

function report(name: VitalName, value: number): void {
  if (reported.has(name)) return;
  reported.add(name);
  const rounded = name === 'CLS' ? Math.round(value * 1000) / 1000 : Math.round(value);
  try {
    analytics.track({ name: 'web_vitals', params: { metric_name: name, value: rounded, rating: rate(name, rounded) } });
  } catch {
    /* analytics not ready */
  }
}

function observe(type: string, cb: (entries: PerformanceEntryList) => void): void {
  try {
    const po = new PerformanceObserver((list) => cb(list.getEntries()));
    po.observe({ type, buffered: true } as PerformanceObserverInit);
  } catch {
    /* entry type unsupported in this browser */
  }
}

function startWebVitals(): void {
  if (typeof window === 'undefined' || typeof PerformanceObserver === 'undefined') return;

  // TTFB from the navigation entry.
  try {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    if (nav) report('TTFB', nav.responseStart);
  } catch {
    /* noop */
  }

  observe('paint', (entries) => {
    for (const e of entries) if (e.name === 'first-contentful-paint') report('FCP', e.startTime);
  });

  let lcp = 0;
  observe('largest-contentful-paint', (entries) => {
    const last = entries[entries.length - 1];
    if (last) lcp = last.startTime;
  });

  let cls = 0;
  observe('layout-shift', (entries) => {
    for (const e of entries as unknown as Array<{ value: number; hadRecentInput: boolean }>) {
      if (!e.hadRecentInput) cls += e.value;
    }
  });

  let inp = 0;
  observe('event', (entries) => {
    for (const e of entries as unknown as Array<{ duration: number }>) {
      if (e.duration > inp) inp = e.duration;
    }
  });

  // Flush the metrics that are only final at page-hide.
  const flush = () => {
    if (lcp) report('LCP', lcp);
    report('CLS', cls);
    if (inp) report('INP', inp);
  };
  addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  addEventListener('pagehide', flush);
}

/** Install global error handlers + Web Vitals collection. Idempotent. */
export function initMonitoring(): void {
  if (started || typeof window === 'undefined') return;
  started = true;

  window.addEventListener('error', (event) => {
    captureError(event.error ?? event.message, { source: 'window.onerror' });
  });
  window.addEventListener('unhandledrejection', (event) => {
    captureError(event.reason, { source: 'unhandledrejection' });
  });

  startWebVitals();
}
