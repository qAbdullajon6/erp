import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Check, ArrowRight } from "lucide-react";
import { PRICING_TIERS, formatPrice, getAnnualSavings } from "@/lib/pricing/config";
import { analytics } from "@/lib/analytics";
import { useSectionVisibility } from "@/lib/analytics/hooks";
import { openDemoModal } from "@/components/site/DemoModal";
import { cn } from "@/lib/utils";

/**
 * Pricing V2 - Linear/Vercel style
 *
 * Pattern: Clean, minimal pricing cards with strong visual hierarchy
 * Annual/monthly toggle prominent
 * Popular tier clearly highlighted
 */
export function PricingV2() {
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("annual");
  const sectionRef = useSectionVisibility("pricing");

  const handlePlanClick = (planId: string, planName: string, ctaText: string) => {
    analytics.track({
      name: "pricing_plan_click",
      params: { plan_id: planId, plan_name: planName, billing_cycle: billingCycle, cta_text: ctaText },
    });
    openDemoModal();
  };

  const handleBillingToggle = (cycle: "monthly" | "annual") => {
    setBillingCycle(cycle);
    analytics.track({ name: "pricing_billing_toggle", params: { billing_cycle: cycle } });
  };

  return (
    <section id="pricing" ref={sectionRef} className="relative overflow-hidden py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6">
        {/* Header */}
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="font-display text-5xl font-bold tracking-tight text-foreground sm:text-6xl">
            Simple, transparent pricing
          </h2>
          <p className="mt-6 text-xl text-muted-foreground">
            Choose the plan that fits your fleet. Every plan includes a 14-day free trial.
          </p>
        </div>

        {/* Billing toggle */}
        <div className="mt-12 flex justify-center">
          <div className="inline-flex items-center gap-3 rounded-xl border border-border/60 bg-surface/40 p-1.5">
            {(["monthly", "annual"] as const).map((cycle) => (
              <button
                key={cycle}
                onClick={() => handleBillingToggle(cycle)}
                className={cn(
                  "rounded-lg px-8 py-3 text-sm font-semibold capitalize transition-all",
                  billingCycle === cycle
                    ? "bg-brand text-brand-foreground shadow-lg shadow-brand/20"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {cycle}
                {cycle === "annual" && (
                  <span className="ml-2 rounded-full bg-success/20 px-2 py-0.5 text-xs font-bold text-success">
                    Save {getAnnualSavings(PRICING_TIERS[1])}%
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Pricing cards */}
        <div className="mt-16 grid gap-8 lg:grid-cols-3">
          {PRICING_TIERS.map((tier) => {
            const price = billingCycle === "monthly" ? tier.price.monthly : tier.price.annual / 12;
            const isPopular = Boolean(tier.popular);
            const isEnterprise = tier.id === "enterprise";

            return (
              <div
                key={tier.id}
                className={cn(
                  "relative flex flex-col rounded-2xl border bg-surface p-8",
                  isPopular
                    ? "border-brand shadow-2xl shadow-brand/10 ring-2 ring-brand/20"
                    : "border-border/60"
                )}
              >
                {/* Popular badge */}
                {isPopular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <span className="rounded-full bg-brand px-4 py-1.5 text-xs font-bold text-brand-foreground shadow-lg">
                      Most popular
                    </span>
                  </div>
                )}

                {/* Tier name */}
                <h3 className="text-2xl font-bold text-foreground">{tier.name}</h3>
                <p className="mt-3 text-sm text-muted-foreground">{tier.description}</p>

                {/* Price */}
                <div className="mt-8">
                  <div className="flex items-baseline gap-2">
                    <span className="font-display text-5xl font-bold tracking-tight text-foreground">
                      {formatPrice(price, tier.price.currency)}
                    </span>
                    {price > 0 && <span className="text-lg text-muted-foreground">/month</span>}
                  </div>
                  {billingCycle === "annual" && price > 0 && (
                    <p className="mt-2 text-sm text-muted-foreground">
                      Billed {formatPrice(tier.price.annual, tier.price.currency)} annually
                    </p>
                  )}
                  {isEnterprise && (
                    <p className="mt-2 text-sm text-muted-foreground">Contact us for pricing</p>
                  )}
                </div>

                {/* CTA */}
                <Button
                  onClick={() => handlePlanClick(tier.id, tier.name, tier.cta.text)}
                  className={cn(
                    "mt-8 h-12 w-full text-base font-semibold",
                    isPopular
                      ? "bg-brand text-brand-foreground hover:bg-brand/90"
                      : "border border-border bg-transparent text-foreground hover:bg-surface-elevated"
                  )}
                >
                  {tier.cta.text}
                  <ArrowRight className="h-5 w-5" />
                </Button>

                {/* Features */}
                <ul className="mt-8 space-y-4">
                  {tier.features.map((feature, idx) => (
                    <li
                      key={idx}
                      className={cn(
                        "flex items-start gap-3 text-sm",
                        !feature.included && "opacity-40"
                      )}
                    >
                      <Check
                        className={cn(
                          "mt-0.5 h-5 w-5 shrink-0",
                          feature.included ? "text-brand" : "text-muted-foreground"
                        )}
                        strokeWidth={2.5}
                      />
                      <span className={feature.included ? "text-foreground" : "text-muted-foreground"}>
                        {feature.text}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        {/* FAQ link */}
        <p className="mt-16 text-center text-muted-foreground">
          Questions about pricing?{" "}
          <button
            onClick={() => {
              analytics.track({ name: "pricing_contact_click", params: {} });
              openDemoModal();
            }}
            className="font-semibold text-brand hover:underline"
          >
            Talk to our team
          </button>
        </p>
      </div>
    </section>
  );
}
