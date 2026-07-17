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
  /// A single note line with its own icon — status never travels as colour
  /// alone (see kpi-cards.tsx's original TONE_STYLES this generalizes).
  note?: { icon: LucideIcon; text: string; tone: MetricTone };
  /// Visual weight within a row of otherwise-equal tiles (Financial
  /// Overview: Revenue is the headline figure, Profit the runner-up, Expenses/
  /// Outstanding supporting context — not four equally-weighted numbers).
  emphasis?: "primary" | "secondary" | "default";
}

/// Consolidates two near-identical tiles (kpi-cards.tsx's KPI tile and
/// financial-overview.tsx's figure tile) that had drifted into separate,
/// slightly different implementations of the same idea.
export function MetricCard({ label, value, icon: Icon, variant = "default", note, emphasis = "default" }: MetricCardProps) {
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
      </SurfaceCard>
    );
  }

  return (
    <SurfaceCard className="group relative p-5 transition-all duration-200 hover:border-brand/30 hover:shadow-lg hover:shadow-brand/10">
      <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-brand/5 blur-3xl transition-all duration-200 group-hover:bg-brand/10" />
      <div className="relative flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="mt-2 text-3xl font-semibold leading-none text-foreground">{value}</p>
          {note ? (
            <p className={cn("mt-3 flex items-center gap-1.5 text-sm font-medium", NOTE_TONE_CLASS[note.tone])}>
              <note.icon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{note.text}</span>
            </p>
          ) : null}
        </div>
        <span className="shrink-0 rounded-xl bg-brand/10 p-2.5 text-brand">
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </SurfaceCard>
  );
}
