import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ErrorState, EmptyState } from "@/components/shared/list-states";
import { PlanCard } from "./plan-card";
import { CreateSubscriptionDialog } from "./create-subscription-dialog";
import {
  usePlansQuery,
  useSubscriptionQuery,
  useUpgradeMutation,
  useDowngradeMutation,
  type Plan,
  type Subscription,
} from "@/lib/api/billing";
import { CreditCard } from "lucide-react";

export function PlansTab() {
  const plansQuery = usePlansQuery();
  const subQuery = useSubscriptionQuery();
  const upgrade = useUpgradeMutation();
  const downgrade = useDowngradeMutation();

  if (plansQuery.isLoading || subQuery.isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-96 rounded-xl" />
        ))}
      </div>
    );
  }

  if (plansQuery.isError) {
    return <ErrorState message="Failed to load plans." onRetry={() => void plansQuery.refetch()} />;
  }

  const plans = plansQuery.data ?? [];
  const subscription = subQuery.data ?? null;

  if (plans.length === 0) {
    return (
      <EmptyState
        icon={CreditCard}
        title="No plans configured"
        description="No subscription plans exist yet. Seed plans on the server to offer them here."
      />
    );
  }

  const currentPlanId = subscription?.plan.id ?? null;
  const currentPrice = subscription?.plan.price ?? null;

  const handleChange = async (plan: Plan, kind: "upgrade" | "downgrade") => {
    try {
      if (kind === "upgrade") {
        await upgrade.mutateAsync(plan.id);
        toast.success(`Upgraded to ${plan.name}`);
      } else {
        await downgrade.mutateAsync({ newPlanId: plan.id, immediate: false });
        toast.success(`Downgrade to ${plan.name} scheduled for the end of the billing period`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to change plan");
    }
  };

  return (
    <div className="space-y-4">
      {!subscription ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-border p-4">
          <p className="text-sm text-muted-foreground">
            This organization has no active subscription. Start one to enable billing features.
          </p>
          <CreateSubscriptionDialog
            plans={plans}
            trigger={<Button size="sm">Start subscription</Button>}
          />
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {plans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            current={plan.id === currentPlanId}
            action={renderAction(plan, subscription, currentPlanId, currentPrice, handleChange, upgrade.isPending || downgrade.isPending)}
          />
        ))}
      </div>
    </div>
  );
}

function renderAction(
  plan: Plan,
  subscription: Subscription | null,
  currentPlanId: string | null,
  currentPrice: number | null,
  onChange: (plan: Plan, kind: "upgrade" | "downgrade") => void,
  pending: boolean,
) {
  // No subscription: the create flow above owns plan selection.
  if (!subscription) return null;

  if (plan.id === currentPlanId) {
    return (
      <Button variant="outline" className="w-full" disabled>
        Current plan
      </Button>
    );
  }

  const isUpgrade = currentPrice !== null && plan.price > currentPrice;
  const label = isUpgrade ? "Upgrade" : "Downgrade";
  const description = isUpgrade
    ? `Upgrade to ${plan.name} now? The new limits take effect immediately.`
    : `Downgrade to ${plan.name}? This is scheduled for the end of your current billing period so you keep your current limits until then.`;

  return (
    <ConfirmDialog
      trigger={
        <Button variant={isUpgrade ? "default" : "outline"} className="w-full" disabled={pending}>
          {label}
        </Button>
      }
      title={`${label} to ${plan.name}?`}
      description={description}
      confirmLabel={label}
      onConfirm={() => onChange(plan, isUpgrade ? "upgrade" : "downgrade")}
    />
  );
}
