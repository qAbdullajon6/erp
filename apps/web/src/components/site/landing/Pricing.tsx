import { Check, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { openDemoModal } from "@/components/site/DemoModal";
import { analytics } from "@/lib/analytics";
import { useSectionVisibility } from "@/lib/analytics/hooks";
import { cn } from "@/lib/utils";
import { Section, SectionHeading, Card } from "./primitives";
import { Reveal } from "./motion";

const PLANS = [
  {
    name: "Starter",
    price: "$29",
    period: "/mo",
    description: "For small teams just getting operations off the ground.",
    features: [
      "Up to 5 vehicles",
      "Up to 3 users",
      "Orders & dispatch",
      "Customer management",
      "Basic reports",
    ],
    cta: "Get started",
    highlight: false,
    badge: null,
  },
  {
    name: "Growth",
    price: "$79",
    period: "/mo",
    description: "For growing companies managing an active fleet every day.",
    features: [
      "Up to 30 vehicles",
      "Up to 15 users",
      "Everything in Starter",
      "Fleet tracking & GPS",
      "Finance & invoicing",
      "AI assistant",
      "Driver mobile app",
    ],
    cta: "Get started",
    highlight: true,
    badge: "Most popular",
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    description: "For large fleets with custom requirements and integrations.",
    features: [
      "Unlimited vehicles",
      "Unlimited users",
      "Everything in Growth",
      "Custom integrations",
      "Dedicated onboarding",
      "Priority support",
    ],
    cta: "Contact us",
    highlight: false,
    badge: null,
  },
] as const;

export function Pricing() {
  const sectionRef = useSectionVisibility("pricing");

  const handleCta = (plan: string, cta: string) => {
    analytics.track({
      name: "pricing_plan_click",
      params: { plan_id: plan.toLowerCase(), plan_name: plan, billing_cycle: "monthly", cta_text: cta },
    });
    openDemoModal("pricing");
  };

  return (
    <Section id="pricing" sectionRef={sectionRef} className="scroll-mt-16">
      <SectionHeading
        eyebrow="Pricing"
        title="Simple, transparent pricing"
        lead="One price per plan — no per-seat fees, no hidden charges. Start small and grow when you're ready."
      />

      <div className="mt-14 grid gap-6 lg:grid-cols-3">
        {PLANS.map((plan, i) => (
          <Reveal key={plan.name} delay={i * 70}>
            <Card
              className={cn(
                "relative flex h-full flex-col p-7",
                plan.highlight
                  ? "border-brand/50 bg-brand/5 shadow-[0_0_40px_-12px_oklch(0.62_0.22_45/0.22)]"
                  : "",
              )}
            >
              {plan.badge && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full border border-brand/30 bg-brand px-3.5 py-1 text-[11px] font-semibold text-brand-foreground">
                  {plan.badge}
                </span>
              )}

              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  {plan.name}
                </p>
                <div className="mt-3 flex items-end gap-1">
                  <span className="font-display text-4xl font-bold tracking-tight text-foreground">
                    {plan.price}
                  </span>
                  {plan.period && (
                    <span className="mb-1 text-sm text-muted-foreground">{plan.period}</span>
                  )}
                </div>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {plan.description}
                </p>
              </div>

              <ul className="mt-7 flex-1 space-y-2.5 border-t border-border/60 pt-6">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-foreground/80">
                    <Check
                      className={cn(
                        "mt-0.5 h-4 w-4 shrink-0",
                        plan.highlight ? "text-brand" : "text-muted-foreground",
                      )}
                    />
                    {f}
                  </li>
                ))}
              </ul>

              <Button
                onClick={() => handleCta(plan.name, plan.cta)}
                className={cn(
                  "mt-8 h-11 w-full font-semibold",
                  plan.highlight
                    ? "bg-brand text-brand-foreground hover:bg-brand/90"
                    : "border border-border bg-surface/60 text-foreground hover:bg-surface hover:text-foreground",
                )}
              >
                {plan.cta}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Card>
          </Reveal>
        ))}
      </div>

      <Reveal delay={280}>
        <p className="mt-8 text-center text-sm text-muted-foreground">
          All plans include a 14-day free trial. No credit card required.
        </p>
      </Reveal>
    </Section>
  );
}
