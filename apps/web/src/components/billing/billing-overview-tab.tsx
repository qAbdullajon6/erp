import { Activity, CalendarClock, CreditCard, Users, TrendingUp, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SurfaceCard } from "@/components/ui/surface-card";
import { MetricCard, type MetricTone } from "@/components/ui/metric-card";
import { ErrorState, EmptyState } from "@/components/shared/list-states";
import { statusLabel } from "@/components/shared/status-badge";
import { UsageMeter } from "./usage-meter";
import { CreateSubscriptionDialog } from "./create-subscription-dialog";
import { formatDate } from "@/lib/format";
import {
  usePlansQuery,
  useSubscriptionQuery,
  useUsageQuery,
  useSeatsQuery,
  type SubscriptionStatus,
} from "@/lib/api/billing";

const STATUS_TONE: Record<SubscriptionStatus, MetricTone> = {
  ACTIVE: "good",
  TRIAL: "neutral",
  SUSPENDED: "warning",
  EXPIRED: "warning",
  CANCELLED: "warning",
};

export function BillingOverviewTab() {
  const subQuery = useSubscriptionQuery();
  const usageQuery = useUsageQuery();
  const seatsQuery = useSeatsQuery();
  const plansQuery = usePlansQuery();

  if (subQuery.isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
    );
  }

  if (subQuery.isError) {
    return <ErrorState message="Failed to load billing overview." onRetry={() => void subQuery.refetch()} />;
  }

  const subscription = subQuery.data ?? null;

  if (!subscription) {
    return (
      <EmptyState
        icon={CreditCard}
        title="No active subscription"
        description="Start a subscription to see plan, usage and renewal information at a glance."
        action={
          <CreateSubscriptionDialog
            plans={plansQuery.data ?? []}
            trigger={<Button>Start subscription</Button>}
          />
        }
      />
    );
  }

  const seats = seatsQuery.data;
  const seatsValue = seats
    ? seats.isUnlimited
      ? `${seats.used} · ∞`
      : `${seats.used} / ${seats.available}`
    : "—";

  const metrics = usageQuery.data?.metrics ?? [];
  const attention = metrics.filter((m) => !m.isUnlimited && m.percentageUsed >= 80);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Current plan" value={subscription.plan.name} icon={CreditCard} />
        <MetricCard
          label="Status"
          value={statusLabel(subscription.status)}
          icon={Activity}
          note={{
            icon: Activity,
            text: subscription.autoRenew ? "Auto-renew on" : "Auto-renew off",
            tone: STATUS_TONE[subscription.status],
          }}
        />
        <MetricCard label="Seats in use" value={seatsValue} icon={Users} />
        <MetricCard
          label={subscription.autoRenew ? "Renews" : "Ends"}
          value={formatDate(subscription.currentPeriodEnd)}
          icon={CalendarClock}
        />
      </div>

      <SurfaceCard className="p-6">
        <div className="flex items-center gap-2">
          <span className="rounded-lg bg-brand/10 p-2 text-brand">
            <TrendingUp className="h-4 w-4" />
          </span>
          <h3 className="font-display text-base font-semibold text-foreground">Quotas needing attention</h3>
        </div>

        {metrics.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">Usage data will appear once resources are metered.</p>
        ) : attention.length === 0 ? (
          <p className="mt-4 flex items-center gap-2 text-sm text-success">
            <CheckCircle2 className="h-4 w-4" /> All quotas are comfortably within limits.
          </p>
        ) : (
          <div className="mt-5 grid gap-x-8 gap-y-5 sm:grid-cols-2">
            {attention.map((metric) => (
              <UsageMeter key={metric.metricType} metric={metric} />
            ))}
          </div>
        )}
      </SurfaceCard>
    </div>
  );
}
