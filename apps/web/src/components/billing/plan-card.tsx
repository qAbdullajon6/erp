import type { ReactNode } from "react";
import { Check, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { SurfaceCard } from "@/components/ui/surface-card";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/format";
import { planPriceMajor, type Plan } from "@/lib/api/billing";
import { featureEntries, featureLabel, featureValueText, isCapability } from "./feature-format";

interface PlanCardProps {
  plan: Plan;
  /// Marks the org's current plan — gets a ring and a "Current plan" badge.
  current?: boolean;
  /// CTA rendered in the card footer (Upgrade / Downgrade / Select).
  action?: ReactNode;
}

export function PlanCard({ plan, current = false, action }: PlanCardProps) {
  const entries = featureEntries(plan.features);
  const limits = entries.filter(([, v]) => !isCapability(v));
  const capabilities = entries.filter(([, v]) => isCapability(v));

  return (
    <SurfaceCard
      className={cn(
        "flex flex-col p-6",
        current && "border-brand/40 ring-1 ring-brand/30",
        plan.isFeatured && !current && "border-brand/25",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-lg font-semibold text-foreground">{plan.name}</h3>
          {plan.description ? (
            <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {current ? <Badge variant="brand">Current plan</Badge> : null}
          {plan.isFeatured && !current ? (
            <Badge variant="warning" className="gap-1">
              <Star className="h-3 w-3" /> Popular
            </Badge>
          ) : null}
          {plan.isActive === false ? <Badge variant="muted">Inactive</Badge> : null}
        </div>
      </div>

      <div className="mt-4 flex items-baseline gap-1">
        <span className="font-display text-3xl font-bold text-foreground">
          {formatMoney(planPriceMajor(plan.price), plan.currency)}
        </span>
        <span className="text-sm text-muted-foreground">/ month</span>
      </div>
      {plan.annualPrice ? (
        <p className="mt-1 text-xs text-muted-foreground">
          or {formatMoney(planPriceMajor(plan.annualPrice), plan.currency)} / year
        </p>
      ) : null}

      <dl className="mt-5 space-y-2">
        {limits.map(([key, value]) => (
          <div key={key} className="flex items-baseline justify-between gap-3 text-sm">
            <dt className="text-muted-foreground">{featureLabel(key)}</dt>
            <dd className="font-medium text-foreground tabular-nums">{featureValueText(value)}</dd>
          </div>
        ))}
      </dl>

      {capabilities.length > 0 ? (
        <ul className="mt-4 space-y-1.5 border-t border-border pt-4">
          {capabilities.map(([key, value]) => (
            <li
              key={key}
              className={cn(
                "flex items-center gap-2 text-sm",
                value ? "text-foreground" : "text-muted-foreground/60 line-through",
              )}
            >
              <Check className={cn("h-4 w-4 shrink-0", value ? "text-success" : "text-muted-foreground/40")} />
              {featureLabel(key)}
            </li>
          ))}
        </ul>
      ) : null}

      {action ? <div className="mt-6 pt-2">{action}</div> : null}
    </SurfaceCard>
  );
}
