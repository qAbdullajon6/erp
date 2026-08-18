import { Link } from "@tanstack/react-router";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface ExceptionHeroProps {
  delayed: number;
  worstDelayDays: number | null;
  unassigned: number | null;
  oldestUnassignedWait: string | null;
  readyDrivers: number | null;
  readyVehicles: number | null;
  includeFleet: boolean;
  loading: boolean;
}

/// Primary exception strip — Needs Dispatch / Ready / Delayed.
/// On-road stays in the secondary right column, not here.
export function ExceptionHero({
  delayed,
  worstDelayDays,
  unassigned,
  oldestUnassignedWait,
  readyDrivers,
  readyVehicles,
  includeFleet,
  loading,
}: ExceptionHeroProps) {
  if (loading) {
    return <Skeleton className="h-16 rounded-xl" />;
  }

  const tiles = [
    ...(includeFleet
      ? [
          {
            key: "unassigned",
            headline: `${unassigned ?? 0} Needs dispatch`,
            detail:
              (unassigned ?? 0) > 0
                ? oldestUnassignedWait
                  ? `Oldest wait: ${oldestUnassignedWait}`
                  : "Awaiting driver"
                : "Queue clear",
            tone: (unassigned ?? 0) > 0 ? ("warn" as const) : ("good" as const),
            to: "/app/dispatches/board",
            search: undefined as Record<string, string> | undefined,
          },
          {
            key: "ready",
            headline: `${readyDrivers ?? 0} Ready`,
            detail:
              readyVehicles != null
                ? `${readyVehicles} vehicles free`
                : "Drivers idle",
            tone: (readyDrivers ?? 0) > 0 ? ("good" as const) : ("warn" as const),
            to: "/app/dispatches/board",
            search: undefined as Record<string, string> | undefined,
          },
        ]
      : []),
    {
      key: "delayed",
      headline: delayed > 0 ? `${delayed} Delayed` : "0 Delayed",
      detail: delayed > 0 && worstDelayDays != null ? `Worst: ${worstDelayDays}d` : "On schedule",
      tone: delayed > 0 ? ("bad" as const) : ("good" as const),
      to: "/app/orders",
      search: { tab: "action" } as Record<string, string> | undefined,
    },
  ];

  return (
    <div className={cn("grid gap-2", tiles.length >= 3 ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-1")}>
      {tiles.map((t) => (
        <Link
          key={t.key}
          to={t.to}
          search={t.search}
          className={cn(
            "rounded-xl border px-3 py-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40",
            t.tone === "bad" && "border-destructive/35 bg-destructive/[0.08] hover:bg-destructive/[0.12]",
            t.tone === "warn" && "border-warning/35 bg-warning/[0.08] hover:bg-warning/[0.12]",
            t.tone === "good" && "border-success/25 bg-success/[0.06] hover:bg-success/[0.1]",
          )}
        >
          <p
            className={cn(
              "text-[15px] font-semibold leading-snug sm:text-base",
              t.tone === "bad" && "text-destructive",
              t.tone === "warn" && "text-warning",
              t.tone === "good" && "text-foreground",
            )}
          >
            {t.headline}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{t.detail}</p>
        </Link>
      ))}
    </div>
  );
}

interface SecondaryPulseProps {
  dueToday: number;
  deliveredToday: number;
  pickups: number;
  freeDrivers: number | null;
  freeVehicles: number | null;
  includeFleet: boolean;
}

export function SecondaryPulse({
  dueToday,
  deliveredToday,
  pickups,
  freeDrivers,
  freeVehicles,
  includeFleet,
}: SecondaryPulseProps) {
  const items = [
    { label: "Due today", value: String(dueToday) },
    { label: "Delivered", value: String(deliveredToday) },
    { label: "Pickups", value: String(pickups) },
    ...(includeFleet && freeDrivers != null && freeVehicles != null
      ? [{ label: "Free", value: `${freeDrivers}d / ${freeVehicles}v` }]
      : []),
  ];

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-0.5 text-[11px] text-muted-foreground">
      {items.map((item, i) => (
        <span key={item.label} className="inline-flex items-baseline gap-1.5">
          {i > 0 && <span className="mr-2 text-border" aria-hidden>
            ·
          </span>}
          <span>{item.label}</span>
          <span className="font-semibold tabular-nums text-foreground">{item.value}</span>
        </span>
      ))}
    </div>
  );
}
