import { toast } from "sonner";
import { RefreshCw, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SurfaceCard } from "@/components/ui/surface-card";
import { DetailField } from "@/components/shared/detail-field";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ErrorState, EmptyState } from "@/components/shared/list-states";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatDate } from "@/lib/format";
import {
  useSubscriptionQuery,
  useCancelMutation,
  useReactivateMutation,
} from "@/lib/api/billing";
import { CreditCard } from "lucide-react";

/// Billing settings surfaces the renewal behaviour that IS controllable through
/// the existing subscription lifecycle endpoints (scheduled cancel ⇄ reactivate,
/// which the API models as the autoRenew flag). There is no standalone billing-
/// settings endpoint, so this reads from the subscription itself.
export function SettingsTab() {
  const subQuery = useSubscriptionQuery();
  const cancel = useCancelMutation();
  const reactivate = useReactivateMutation();

  if (subQuery.isLoading) return <Skeleton className="h-64 rounded-xl" />;
  if (subQuery.isError) {
    return <ErrorState message="Failed to load billing settings." onRetry={() => void subQuery.refetch()} />;
  }

  const subscription = subQuery.data ?? null;
  if (!subscription) {
    return (
      <EmptyState
        icon={CreditCard}
        title="No subscription to configure"
        description="Billing settings become available once this organization has an active subscription."
      />
    );
  }

  const cancelled = subscription.status === "CANCELLED";
  const scheduledCancel = !!subscription.cancelAt && !cancelled;

  const handleCancel = async () => {
    try {
      await cancel.mutateAsync({ immediate: false, reason: "admin_requested" });
      toast.success("Auto-renew turned off — cancels at period end");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update renewal");
    }
  };

  const handleReactivate = async () => {
    try {
      await reactivate.mutateAsync();
      toast.success("Auto-renew turned back on");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update renewal");
    }
  };

  return (
    <div className="space-y-6">
      <SurfaceCard className="p-6">
        <div className="flex items-center gap-2">
          <span className="rounded-lg bg-brand/10 p-2 text-brand">
            <RefreshCw className="h-4 w-4" />
          </span>
          <h3 className="font-display text-base font-semibold text-foreground">Renewal</h3>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
          <DetailField label="Plan" value={subscription.plan.name} />
          <DetailField label="Status" value={<StatusBadge status={subscription.status} />} />
          <DetailField label="Auto-renew" value={subscription.autoRenew ? "On" : "Off"} />
          <DetailField
            label={subscription.autoRenew ? "Next renewal" : "Coverage ends"}
            value={formatDate(subscription.currentPeriodEnd)}
          />
          {subscription.cancelAt ? (
            <DetailField label="Scheduled cancellation" value={formatDate(subscription.cancelAt)} />
          ) : null}
        </div>

        <p className="mt-4 flex items-start gap-2 text-sm text-muted-foreground">
          <CalendarClock className="mt-0.5 h-4 w-4 shrink-0" />
          {subscription.autoRenew
            ? "This subscription renews automatically at the end of each billing period."
            : "Auto-renew is off. Access continues until the period ends, then the subscription lapses."}
        </p>
      </SurfaceCard>

      {!cancelled ? (
        <SurfaceCard className="border-destructive/30 p-6">
          <h3 className="font-display text-base font-semibold text-foreground">Danger zone</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {scheduledCancel
              ? "This subscription is scheduled to cancel at the end of the current period."
              : "Turn off auto-renew to let the subscription lapse at the end of the current period."}
          </p>
          <div className="mt-4">
            {scheduledCancel ? (
              <Button variant="outline" onClick={handleReactivate} disabled={reactivate.isPending}>
                {reactivate.isPending ? "Re-enabling…" : "Turn auto-renew back on"}
              </Button>
            ) : (
              <ConfirmDialog
                trigger={<Button variant="destructive">Turn off auto-renew</Button>}
                title="Turn off auto-renew?"
                description="The subscription stays active until the end of the current billing period, then cancels. You can turn auto-renew back on any time before then."
                confirmLabel="Turn off auto-renew"
                onConfirm={handleCancel}
                destructive
              />
            )}
          </div>
        </SurfaceCard>
      ) : null}
    </div>
  );
}
