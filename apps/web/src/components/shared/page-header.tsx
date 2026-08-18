'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/// There are exactly two page headers in this app, and this file holds both.
///
/// `PageHeader` is for a normal padded page that scrolls: Orders, Customers,
/// Finance, Reports, Settings. `WorkspaceHeader` is for the full-bleed
/// operations screens that fill the viewport and scroll internally — the fleet
/// map, the dispatch board and calendar, geofences, trip replay. Those genuinely
/// cannot afford a `text-3xl` title block above a map, which is why they are a
/// separate pattern rather than a variant we talked ourselves out of.
///
/// What is *not* allowed is a third one. Every one of those workspace screens
/// used to hand-roll its own bar, and they had drifted to four different title
/// sizes — `text-2xl` on the board, `text-xl` on the calendar and the map,
/// `text-sm` on geofences — so screens doing the same job at the same level of
/// the app announced themselves at wildly different volumes.

/// The heading block every module screen opens with. Keeping it here means
/// title size, subtitle tone, and action placement stay identical across
/// Orders, Drivers, Vehicles, Customers, and Dispatches.
export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    // Stacked until xl, side by side above it. `flex-wrap` alone was not enough:
    // a title and a four-button action cluster both fit on one line at 768px only
    // by squeezing the title column to a couple of words' width, so "Orders"
    // and its count broke across three lines beside a tidy row of buttons. The
    // heading now gets a full row of its own until there is genuinely space.
    //
    // That threshold is xl rather than lg because the sidebar rail returns at
    // lg and takes 15rem with it — a 1024px window leaves the header the same
    // room a 768px one does, and reproduced the very squeeze described above.
    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-bold text-foreground sm:text-3xl">{title}</h1>
        {subtitle ? <div className="mt-1 text-sm text-muted-foreground">{subtitle}</div> : null}
      </div>
      {action ? <div className="flex flex-wrap items-center gap-2">{action}</div> : null}
    </div>
  );
}

/// The header bar for a full-bleed operations workspace.
///
/// Compact on purpose: these screens put a map or a board directly underneath,
/// and every pixel this bar takes is a pixel of the actual work surface. The
/// title still renders as the page's one `<h1>`, so the heading outline stays
/// correct even though it does not look like a page title block.
///
/// `status` sits inline with the title (a live-stream pill, a freshness dot).
/// `children` is for a second row — filter chips, a view switcher — which
/// several of these screens need and which should sit inside the same bar
/// rather than floating underneath it.
export function WorkspaceHeader({
  title,
  subtitle,
  icon,
  status,
  action,
  children,
  className,
}: {
  title: string;
  subtitle?: ReactNode;
  /// A small leading glyph. Decorative — pass `aria-hidden`; the title carries
  /// the meaning.
  icon?: ReactNode;
  status?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        'shrink-0 space-y-2 border-b border-border/70 bg-surface px-4 py-2.5 sm:px-5',
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {icon}
            <h1 className="truncate font-display text-lg font-bold tracking-tight text-foreground sm:text-xl">
              {title}
            </h1>
            {status}
          </div>
          {subtitle ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
        {action ? (
          <div className="flex flex-wrap items-center gap-1.5">{action}</div>
        ) : null}
      </div>
      {children}
    </header>
  );
}
