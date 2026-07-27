import { Link } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, FileText, Wallet } from "lucide-react";
import { formatMoney } from "@/lib/format";
import type { FinanceSummary } from "@/lib/api/finance";
import { Skeleton } from "@/components/ui/skeleton";
import { SurfaceCard, SurfaceCardHeader } from "@/components/ui/surface-card";
import { cn } from "@/lib/utils";

interface FinancialWarningsProps {
  finance: FinanceSummary | null | undefined;
  loading: boolean;
}

/// Money as a real card: Outstanding hero → invoice count → Finance CTA.
/// Not a cramped footer strip.
export function FinancialWarnings({ finance, loading }: FinancialWarningsProps) {
  if (loading) return <Skeleton className="h-44 w-full rounded-xl" />;
  if (!finance) return null;

  const overdue = finance.invoices.overdueCount;
  const pending = finance.expenses.pendingCount;

  return (
    <SurfaceCard className={cn("flex flex-col", overdue > 0 && "border-warning/30")}>
      <SurfaceCardHeader className="py-2">
        <div className="flex items-center gap-2">
          <Wallet className="h-3.5 w-3.5 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Money</h3>
        </div>
      </SurfaceCardHeader>

      <div className="flex flex-1 flex-col px-4 pb-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Outstanding
        </p>
        <p className="mt-1 text-3xl font-semibold tabular-nums tracking-tight text-foreground">
          {formatMoney(finance.invoices.totalOutstanding, finance.currency)}
        </p>

        <div className="my-3 h-px bg-border/70" />

        <p className="text-sm font-medium text-foreground">
          {finance.invoices.count} invoices
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Collected {formatMoney(finance.invoices.totalCollected, finance.currency)}
        </p>

        <div className="mt-3 flex flex-col gap-1.5">
          {overdue > 0 ? (
            <Link
              to="/app/finance"
              className="flex items-center gap-2 rounded-md bg-warning/10 px-2.5 py-2 text-xs font-semibold text-warning hover:bg-warning/15"
            >
              <FileText className="h-3.5 w-3.5" />
              {overdue} overdue · {formatMoney(finance.invoices.overdueAmount, finance.currency)}
            </Link>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success">
              <CheckCircle2 className="h-3.5 w-3.5" />
              No overdue invoices
            </span>
          )}
          {pending > 0 && (
            <Link
              to="/app/finance"
              className="flex items-center gap-2 rounded-md bg-brand/10 px-2.5 py-2 text-xs font-semibold text-brand hover:bg-brand/15"
            >
              {pending} expenses to approve
            </Link>
          )}
        </div>

        <Link
          to="/app/finance"
          className="mt-auto inline-flex items-center gap-1 pt-4 text-[12px] font-semibold text-brand hover:underline"
        >
          Finance
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </SurfaceCard>
  );
}
