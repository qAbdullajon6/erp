import { useMemo, useState } from "react";
import { Check, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  PRICING_TIERS,
  formatPrice,
  getAnnualSavings,
  type PricingTier,
} from "@/lib/pricing/config";
import { analytics } from "@/lib/analytics";
import { useSectionVisibility } from "@/lib/analytics/hooks";
import { openDemoModal } from "@/components/site/DemoModal";
import { Section, SectionHeading, Pill } from "./primitives";
import { Reveal } from "./motion";
import { cn } from "@/lib/utils";

type Cycle = "monthly" | "annual";

export function Pricing() {
  const sectionRef = useSectionVisibility("pricing");
  const [cycle, setCycle] = useState<Cycle>("annual");
  const savings = getAnnualSavings(PRICING_TIERS[1]);

  const toggle = (next: Cycle) => {
    setCycle(next);
    analytics.track({ name: "pricing_billing_toggle", params: { billing_cycle: next } });
  };

  const choose = (tier: PricingTier) => {
    analytics.track({
      name: "pricing_plan_click",
      params: { plan_id: tier.id, plan_name: tier.name, billing_cycle: cycle, cta_text: tier.cta.text },
    });
    openDemoModal(`pricing_${tier.id}`);
  };

  return (
    <Section id="pricing" sectionRef={sectionRef} width="wide">
      <SectionHeading
        eyebrow="Pricing"
        title="Pricing that scales with your fleet"
        lead="Every plan includes a 14-day trial, full onboarding, and the AI copilot. No credit card to start."
      />

      <Reveal className="mt-10 flex justify-center">
        <div className="inline-flex items-center rounded-lg border border-border bg-surface p-1">
          {(["monthly", "annual"] as const).map((c) => (
            <button
              key={c}
              onClick={() => toggle(c)}
              className={cn(
                "flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                cycle === c ? "bg-brand text-brand-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {c}
              {c === "annual" && (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                    cycle === "annual" ? "bg-brand-foreground/15 text-brand-foreground" : "bg-success/15 text-success",
                  )}
                >
                  Save {savings}%
                </span>
              )}
            </button>
          ))}
        </div>
      </Reveal>

      <div className="mt-12 grid items-start gap-4 lg:grid-cols-3">
        {PRICING_TIERS.map((tier, i) => (
          <Reveal key={tier.id} delay={i * 80} className="h-full">
            <PlanCard tier={tier} prev={PRICING_TIERS[i - 1]} cycle={cycle} onChoose={() => choose(tier)} />
          </Reveal>
        ))}
      </div>

      <Reveal className="mt-10 text-center">
        <p className="text-sm text-muted-foreground">
          Need something custom?{" "}
          <button
            onClick={() => {
              analytics.track({ name: "pricing_contact_click", params: {} });
              openDemoModal("pricing_custom");
            }}
            className="font-semibold text-brand hover:underline"
          >
            Talk to our team
          </button>
        </p>
      </Reveal>
    </Section>
  );
}

function PlanCard({
  tier,
  prev,
  cycle,
  onChoose,
}: {
  tier: PricingTier;
  prev?: PricingTier;
  cycle: Cycle;
  onChoose: () => void;
}) {
  const popular = Boolean(tier.popular);
  const isEnterprise = tier.id === "enterprise";
  const perMonth = cycle === "monthly" ? tier.price.monthly : tier.price.annual / 12;

  // "Everything in <prev>, plus" — only the features this tier adds.
  const { inheritedFrom, features } = useMemo(() => {
    const included = tier.features.filter((f) => f.included);
    if (!prev) return { inheritedFrom: null as string | null, features: included };
    const prevSet = new Set(prev.features.filter((f) => f.included).map((f) => f.text));
    const added = included.filter((f) => !prevSet.has(f.text));
    return { inheritedFrom: prev.name, features: added };
  }, [tier, prev]);

  return (
    <div
      className={cn(
        "relative flex h-full flex-col rounded-2xl border bg-surface p-7",
        popular ? "border-brand/60 ring-1 ring-brand/40" : "border-border",
      )}
    >
      {popular && (
        <div className="absolute -top-3 left-7">
          <span className="rounded-full bg-brand px-3 py-1 text-[11px] font-semibold text-brand-foreground">
            Most popular
          </span>
        </div>
      )}

      <h3 className="text-lg font-semibold text-foreground">{tier.name}</h3>
      <p className="mt-1.5 text-sm text-muted-foreground">{tier.description}</p>

      <div className="mt-6 flex items-baseline gap-1.5">
        {isEnterprise ? (
          <span className="font-display text-4xl font-semibold tracking-tight text-foreground">Custom</span>
        ) : (
          <>
            <span className="font-display text-4xl font-semibold tracking-tight text-foreground">
              {formatPrice(perMonth, tier.price.currency)}
            </span>
            <span className="text-sm text-muted-foreground">/mo</span>
          </>
        )}
      </div>
      <p className="mt-1.5 h-4 text-xs text-muted-foreground">
        {isEnterprise
          ? "Volume pricing & annual contracts"
          : cycle === "annual"
            ? `Billed ${formatPrice(tier.price.annual, tier.price.currency)} yearly`
            : "Billed monthly"}
      </p>

      <Button
        onClick={onChoose}
        className={cn(
          "mt-6 h-11 w-full font-semibold",
          popular
            ? "bg-brand text-brand-foreground hover:bg-brand/90"
            : "border border-border bg-transparent text-foreground hover:bg-surface-elevated",
        )}
      >
        {tier.cta.text}
        <ArrowRight className="h-4 w-4" />
      </Button>

      <div className="mt-7 space-y-3">
        {inheritedFrom && (
          <p className="text-xs font-medium text-foreground">Everything in {inheritedFrom}, plus:</p>
        )}
        <ul className="space-y-3">
          {features.map((f) => (
            <li key={f.text} className="flex items-start gap-2.5 text-sm">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" strokeWidth={2.5} />
              <span className="text-foreground/85">{f.text}</span>
            </li>
          ))}
        </ul>
      </div>

      {tier.id === "starter" && (
        <div className="mt-6 border-t border-border/60 pt-4">
          <Pill tone="muted">14-day free trial</Pill>
        </div>
      )}
    </div>
  );
}
