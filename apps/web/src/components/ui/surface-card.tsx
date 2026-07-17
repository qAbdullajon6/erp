import * as React from "react";
import { cn } from "@/lib/utils";

/// The gradient-surface shell every dashboard widget hand-rolled identically
/// (`rounded-2xl border border-brand/10 bg-gradient-to-br from-surface
/// to-surface/50`) — found duplicated across 11 dashboard components during
/// the design-system extraction pass. This is the one place that look lives
/// now; widgets compose it instead of repeating the className.
export const SurfaceCard = React.forwardRef<HTMLDivElement, React.ComponentProps<"div">>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "overflow-hidden rounded-2xl border border-brand/10 bg-gradient-to-br from-surface to-surface/50",
        className,
      )}
      {...props}
    />
  ),
);
SurfaceCard.displayName = "SurfaceCard";

/// A SurfaceCard with a bordered header row (title/subtitle/action) — the
/// pattern used by any widget with its own list/content below the header
/// (LiveDispatch, DashboardAlerts, RecentOrdersTable, etc.), as opposed to a
/// single-figure tile (see MetricCard) which doesn't need one.
export const SurfaceCardHeader = React.forwardRef<HTMLDivElement, React.ComponentProps<"div">>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex items-center justify-between gap-4 border-b border-brand/10 px-6 py-5", className)}
      {...props}
    />
  ),
);
SurfaceCardHeader.displayName = "SurfaceCardHeader";
