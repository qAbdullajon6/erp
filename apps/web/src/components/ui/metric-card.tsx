import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { SurfaceCard } from "@/components/ui/surface-card";

export type MetricTone = "good" | "warning" | "neutral";

const NOTE_TONE_CLASS: Record<MetricTone, string> = {
  good: "text-success",
  warning: "text-warning",
  neutral: "text-muted-foreground",
};

export interface MetricCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  /// The KPI-grid style (large value, hover glow, icon chip, optional note
  /// row) vs. the tighter tile style used for a row of related figures
  /// (Financial Overview) where a hover glow per-tile would be noisy.
  variant?: "default" | "compact";
  /// Dense strip for command-center / dashboard KPI rows — same content,
  /// less chrome, so four tiles fit without dominating the first viewport.
  size?: "default" | "sm";
  /// A single note line with its own icon — status never travels as colour
  /// alone (see kpi-cards.tsx's original TONE_STYLES this generalizes).
  note?: { icon: LucideIcon; text: string; tone: MetricTone };
  /// A trailing slot for figures that carry their own element rather than a
  /// plain sentence — a period-over-period comparison badge, say. Kept separate
  /// from `note` so that the colour-plus-icon rule above still governs anything
  /// expressing status.
  footer?: ReactNode;
  /// Visual weight within a row of otherwise-equal tiles (Financial
  /// Overview: Revenue is the headline figure, Profit the runner-up, Expenses/
  /// Outstanding supporting context — not four equally-weighted numbers).
  emphasis?: "primary" | "secondary" | "default";
}

/// Consolidates two near-identical tiles (kpi-cards.tsx's KPI tile and
/// financial-overview.tsx's figure tile) that had drifted into separate,
/// slightly different implementations of the same idea.
export function MetricCard({
  label,
  value,
  icon: Icon,
  variant = "default",
  size = "default",
  note,
  footer,
  emphasis = "default",
}: MetricCardProps) {
  const noteLine =
    note !== undefined ? (
      <p className={cn("flex items-center gap-1.5 font-medium", NOTE_TONE_CLASS[note.tone])}>
        <note.icon className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{note.text}</span>
      </p>
    ) : null;
  if (variant === "compact") {
    return (
      <SurfaceCard
        className={cn("p-5", emphasis === "primary" && "border-brand/25 bg-gradient-to-br from-brand/10 to-surface")}
      >
        <div className="flex items-center justify-between gap-2">
          <p className={cn("font-medium text-muted-foreground", emphasis === "default" ? "text-xs" : "text-sm")}>
            {label}
          </p>
          <Icon className={cn("h-4 w-4 shrink-0", emphasis === "primary" ? "text-brand" : "text-muted-foreground")} />
        </div>
        <p
          className={cn(
            "mt-2 font-semibold leading-none text-foreground",
            emphasis === "primary" ? "text-2xl" : emphasis === "secondary" ? "text-xl" : "text-lg",
          )}
        >
          {value}
        </p>
        {noteLine ? <div className="mt-2 text-xs">{noteLine}</div> : null}
        {footer ? <div className="mt-2 text-xs text-muted-foreground">{footer}</div> : null}
      </SurfaceCard>
    );
  }

  const dense = size === "sm";

  return (
    <SurfaceCard
      className={cn(
        "group relative transition-all duration-200 hover:border-brand/30 hover:shadow-lg hover:shadow-brand/10",
        dense ? "p-3.5" : "p-5",
      )}
    >
      {!dense && (
        <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-brand/5 blur-3xl transition-all duration-200 group-hover:bg-brand/10" />
      )}
      <div className={cn("relative flex items-start justify-between", dense ? "gap-2" : "gap-4")}>
        <div className="min-w-0">
          <p className={cn("font-medium text-muted-foreground", dense ? "text-xs" : "text-sm")}>{label}</p>
          <p
            className={cn(
              "font-semibold leading-none tabular-nums text-foreground",
              dense ? "mt-1.5 text-2xl" : "mt-2 text-3xl",
            )}
          >
            {value}
          </p>
          {noteLine ? (
            <div className={cn(dense ? "mt-1.5 text-xs" : "mt-3 text-sm")}>{noteLine}</div>
          ) : null}
          {footer ? (
            <div className={cn("text-muted-foreground", dense ? "mt-1.5 text-xs" : "mt-3 text-sm")}>
              {footer}
            </div>
          ) : null}
        </div>
        <span
          className={cn(
            "shrink-0 rounded-xl bg-brand/10 text-brand",
            dense ? "p-2" : "p-2.5",
          )}
        >
          <Icon className={dense ? "h-4 w-4" : "h-5 w-5"} />
        </span>
      </div>
    </SurfaceCard>
  );
}
