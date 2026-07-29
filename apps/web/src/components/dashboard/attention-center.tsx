import { Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowRight, CheckCircle2, FileText } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { SurfaceCard, SurfaceCardHeader } from "@/components/ui/surface-card";
import { cn } from "@/lib/utils";
import type { DashboardAttentionCounts } from "@/lib/api/dashboard";

interface AttentionCenterProps {
  attention: DashboardAttentionCounts | null | undefined;
  loading: boolean;
}

export function AttentionCenter({ attention, loading }: AttentionCenterProps) {
  if (loading) return <Skeleton className="h-28 w-full rounded-xl" />;
  if (!attention) return null;

  const { delayedDeliveries, overdueInvoices } = attention;
  const allClear = delayedDeliveries === 0 && overdueInvoices === 0;

  return (
    <SurfaceCard className={cn("p-1", !allClear && "border-warning/25")}>
      <SurfaceCardHeader className="px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Needs attention</h3>
          <p className="text-[11px] text-muted-foreground">Items that may need action today</p>
        </div>
        {allClear ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            <CheckCircle2 className="h-3 w-3" />
            Clear
          </span>
        ) : null}
      </SurfaceCardHeader>

      <div className="grid grid-cols-1 gap-2 px-3 pb-3 min-[640px]:grid-cols-2">
        <AttentionItem
          icon={AlertTriangle}
          label="Delayed deliveries"
          count={delayedDeliveries}
          href="/app/orders"
          emptyLabel="No delayed orders"
        />
        <AttentionItem
          icon={FileText}
          label="Overdue invoices"
          count={overdueInvoices}
          href="/app/finance"
          emptyLabel="No overdue invoices"
        />
      </div>
    </SurfaceCard>
  );
}

function AttentionItem({
  icon: Icon,
  label,
  count,
  href,
  emptyLabel,
}: {
  icon: typeof AlertTriangle;
  label: string;
  count: number;
  href: string;
  emptyLabel: string;
}) {
  const active = count > 0;

  return (
    <Link
      to={href}
      className={cn(
        "group flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 transition-colors",
        active
          ? "border-border bg-muted/30 hover:border-foreground/20 hover:bg-muted/50"
          : "border-border/60 bg-surface/50 text-muted-foreground hover:bg-muted/30",
      )}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <Icon className={cn("h-4 w-4 shrink-0", active ? "text-foreground" : "text-muted-foreground")} />
        <div className="min-w-0">
          <p className={cn("text-sm font-medium", active ? "text-foreground" : "text-muted-foreground")}>
            {label}
          </p>
          <p className="text-[11px] text-muted-foreground">{active ? `${count} open` : emptyLabel}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {active ? (
          <span className="rounded-md bg-foreground/10 px-2 py-0.5 text-xs font-semibold tabular-nums text-foreground">
            {count}
          </span>
        ) : null}
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}
