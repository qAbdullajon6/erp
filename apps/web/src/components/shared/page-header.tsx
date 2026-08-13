'use client';

import type { ReactNode } from 'react';

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
    // Stacked until lg, side by side above it. `flex-wrap` alone was not enough:
    // a title and a four-button action cluster both fit on one line at 768px only
    // by squeezing the title column to a couple of words' width, so "Orders"
    // and its count broke across three lines beside a tidy row of buttons. The
    // heading now gets a full row of its own until there is genuinely space.
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-bold text-foreground sm:text-3xl">{title}</h1>
        {subtitle ? <div className="mt-1 text-sm text-muted-foreground">{subtitle}</div> : null}
      </div>
      {action ? <div className="flex flex-wrap items-center gap-2">{action}</div> : null}
    </div>
  );
}
