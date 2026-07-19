import { useState } from "react";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { SurfaceCard } from "@/components/ui/surface-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { DetailField } from "@/components/shared/detail-field";
import { StatusBadge, statusLabel } from "@/components/shared/status-badge";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ErrorState, EmptyState } from "@/components/shared/list-states";
import { CreateSubscriptionDialog } from "./create-subscription-dialog";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  usePlansQuery,
  useSubscriptionQuery,
  useHistoryQuery,
  useAddSeatsMutation,
  useCancelMutation,
  useReactivateMutation,
  type Subscription,
} from "@/lib/api/billing";
import { CreditCard } from "lucide-react";

export function SubscriptionTab() {
  const subQuery = useSubscriptionQuery();
  const plansQuery = usePlansQuery();

  if (subQuery.isLoading) return <Skeleton className="h-64 rounded-xl" />;
  if (subQuery.isError) {
    return <ErrorState message="Failed to load subscription." onRetry={() => void subQuery.refetch()} />;
  }

  const subscription = subQuery.data ?? null;

  if (!subscription) {
    return (
      <EmptyState
        icon={CreditCard}
        title="No active subscription"
        description="This organization isn't subscribed to a plan yet. Start one to unlock billing features and quotas."
        action={
          <CreateSubscriptionDialog
            plans={plansQuery.data ?? []}
            trigger={<Button>Start subscription</Button>}
          />
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <SubscriptionDetailCard subscription={subscription} />
      <HistoryTable />
    </div>
  );
}

function SubscriptionDetailCard({ subscription }: { subscription: Subscription }) {
  const scheduledCancel = subscription.cancelAt && subscription.status !== "CANCELLED";

  return (
    <SurfaceCard className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-display text-xl font-semibold text-foreground">{subscription.plan.name}</h2>
            <StatusBadge status={subscription.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {scheduledCancel
              ? `Cancels on ${formatDate(subscription.cancelAt)}`
              : subscription.autoRenew
                ? `Renews on ${formatDate(subscription.currentPeriodEnd)}`
                : `Ends on ${formatDate(subscription.currentPeriodEnd)}`}
          </p>
        </div>
        <SubscriptionActions subscription={subscription} />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
        <DetailField label="Status" value={<StatusBadge status={subscription.status} />} />
        <DetailField label="Seats" value={subscription.seats === null ? "Unlimited" : subscription.seats} />
        <DetailField label="Auto-renew" value={subscription.autoRenew ? "On" : "Off"} />
        <DetailField label="Current period start" value={formatDate(subscription.currentPeriodStart)} />
        <DetailField label="Current period end" value={formatDate(subscription.currentPeriodEnd)} />
        {subscription.trialEndsAt ? (
          <DetailField label="Trial ends" value={formatDate(subscription.trialEndsAt)} />
        ) : null}
        {subscription.cancelAt ? (
          <DetailField label="Scheduled cancellation" value={formatDate(subscription.cancelAt)} />
        ) : null}
        {subscription.cancellationReason ? (
          <DetailField label="Cancellation reason" value={subscription.cancellationReason} />
        ) : null}
      </div>
    </SurfaceCard>
  );
}

function SubscriptionActions({ subscription }: { subscription: Subscription }) {
  const addSeats = useAddSeatsMutation();
  const cancel = useCancelMutation();
  const reactivate = useReactivateMutation();

  const [seatsOpen, setSeatsOpen] = useState(false);
  const [seatCount, setSeatCount] = useState("");

  const cancelled = subscription.status === "CANCELLED";
  const scheduledCancel = !!subscription.cancelAt && !cancelled;

  const handleAddSeats = async (e: React.FormEvent) => {
    e.preventDefault();
    const count = Number(seatCount);
    if (!Number.isFinite(count) || count < 1) return;
    try {
      await addSeats.mutateAsync(count);
      toast.success(`Added ${count} seat${count === 1 ? "" : "s"}`);
      setSeatCount("");
      setSeatsOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add seats");
    }
  };

  const handleCancel = async () => {
    try {
      await cancel.mutateAsync({ immediate: false, reason: "admin_requested" });
      toast.success("Cancellation scheduled for the end of the billing period");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to cancel subscription");
    }
  };

  const handleReactivate = async () => {
    try {
      await reactivate.mutateAsync();
      toast.success("Subscription reactivated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reactivate subscription");
    }
  };

  if (cancelled) {
    return <span className="text-sm text-muted-foreground">This subscription is cancelled.</span>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Dialog open={seatsOpen} onOpenChange={setSeatsOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5">
            <UserPlus className="h-4 w-4" /> Add seats
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add seats</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddSeats} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="seat-count">Number of seats to add</Label>
              <Input
                id="seat-count"
                type="number"
                min={1}
                value={seatCount}
                onChange={(e) => setSeatCount(e.target.value)}
                placeholder="e.g. 5"
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={addSeats.isPending || !seatCount}>
                {addSeats.isPending ? "Adding…" : "Add seats"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {scheduledCancel ? (
        <Button variant="outline" size="sm" onClick={handleReactivate} disabled={reactivate.isPending}>
          {reactivate.isPending ? "Reactivating…" : "Reactivate"}
        </Button>
      ) : (
        <ConfirmDialog
          trigger={
            <Button variant="destructive" size="sm">
              Cancel subscription
            </Button>
          }
          title="Cancel subscription?"
          description="The subscription stays active until the end of the current billing period, then cancels. You can reactivate any time before then."
          confirmLabel="Schedule cancellation"
          onConfirm={handleCancel}
          destructive
        />
      )}
    </div>
  );
}

function HistoryTable() {
  const { data, isLoading, isError, refetch } = useHistoryQuery();

  if (isLoading) return <Skeleton className="h-40 rounded-xl" />;
  if (isError) return <ErrorState message="Failed to load subscription history." onRetry={() => void refetch()} />;

  const history = data ?? [];

  return (
    <SurfaceCard className="p-0">
      <div className="border-b border-border px-6 py-4">
        <h3 className="font-display text-base font-semibold text-foreground">History</h3>
        <p className="text-sm text-muted-foreground">Every plan change, renewal and cancellation on this subscription.</p>
      </div>
      {history.length === 0 ? (
        <div className="px-6 py-10 text-center text-sm text-muted-foreground">No history yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Event</TableHead>
                <TableHead>Change</TableHead>
                <TableHead>By</TableHead>
                <TableHead className="text-right">When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((h) => (
                <TableRow key={h.id}>
                  <TableCell className="font-medium">{statusLabel(h.eventType)}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {h.fromPlan || h.toPlan
                      ? `${h.fromPlan?.name ?? "—"} → ${h.toPlan?.name ?? "—"}`
                      : (h.reason ?? "—")}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{h.actor?.name ?? "System"}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{formatDateTime(h.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </SurfaceCard>
  );
}
