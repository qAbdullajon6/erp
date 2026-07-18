/**
 * Pricing section - Enterprise-grade design
 *
 * Premium card design with depth, animations, and visual hierarchy.
 * Config-driven architecture allows backend integration without UI changes.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Check, Sparkles } from 'lucide-react';
import { PRICING_TIERS, formatPrice, getAnnualSavings } from '@/lib/pricing/config';
import { analytics } from '@/lib/analytics';
import { useSectionVisibility } from '@/lib/analytics/hooks';
import { openDemoModal } from '@/components/site/DemoModal';

export function Pricing() {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('annual');
  const sectionRef = useSectionVisibility('pricing');

  const handlePlanClick = (planId: string, planName: string, ctaText: string) => {
    analytics.track({
      name: 'pricing_plan_click',
      params: {
        plan_id: planId,
        plan_name: planName,
        billing_cycle: billingCycle,
        cta_text: ctaText,
      },
    });

    openDemoModal();
  };

  const handleBillingToggle = (cycle: 'monthly' | 'annual') => {
    setBillingCycle(cycle);
    analytics.track({
      name: 'pricing_billing_toggle',
      params: { billing_cycle: cycle },
    });
  };

  return (
    <section ref={sectionRef} id="pricing" className="relative py-32">
      {/* Background gradient */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background via-brand/5 to-background" />

      <div className="relative mx-auto max-w-7xl px-6">
        {/* Section Header */}
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand/10 px-4 py-1.5 text-xs font-semibold text-brand backdrop-blur">
            <Sparkles className="h-3.5 w-3.5" />
            Pricing
          </div>
          <h2 className="mt-5 font-display text-5xl font-bold tracking-tight text-foreground md:text-6xl">
            Simple, Transparent Pricing
          </h2>
          <p className="mt-5 text-lg text-muted-foreground">
            Choose the plan that fits your fleet size. All plans include a 14-day free trial.
          </p>

          {/* Billing Cycle Toggle */}
          <div className="mt-10 inline-flex items-center gap-1 rounded-full border border-border/60 bg-background p-1.5 shadow-sm">
            <button
              onClick={() => handleBillingToggle('monthly')}
              className={`rounded-full px-8 py-2.5 text-sm font-semibold transition-all ${
                billingCycle === 'monthly'
                  ? 'bg-surface text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => handleBillingToggle('annual')}
              className={`rounded-full px-8 py-2.5 text-sm font-semibold transition-all ${
                billingCycle === 'annual'
                  ? 'bg-surface text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Annual
              <span className="ml-2.5 rounded-full bg-success/15 px-2.5 py-1 text-xs font-bold text-success">
                Save {getAnnualSavings(PRICING_TIERS[1])}%
              </span>
            </button>
          </div>
        </div>

        {/* Pricing Cards */}
        <div className="mt-20 grid gap-6 lg:grid-cols-3">
          {PRICING_TIERS.map((tier) => {
            const price =
              billingCycle === 'monthly' ? tier.price.monthly : tier.price.annual / 12;
            const isPopular = tier.popular;

            return (
              <div
                key={tier.id}
                className={`group relative flex flex-col rounded-3xl border p-8 transition-all hover:-translate-y-1 ${
                  isPopular
                    ? 'border-brand/40 bg-gradient-to-b from-brand/10 via-brand/5 to-transparent shadow-2xl'
                    : 'border-border/60 bg-surface/40 hover:border-border hover:bg-surface/60 hover:shadow-xl'
                }`}
              >
                {/* Popular Badge */}
                {isPopular && (
                  <div className="absolute -top-5 left-1/2 -translate-x-1/2">
                    <div className="relative">
                      <div className="absolute inset-0 rounded-full bg-gradient-brand opacity-30 blur-xl" />
                      <span className="relative inline-flex rounded-full bg-gradient-brand px-5 py-2 text-xs font-bold text-brand-foreground shadow-brand">
                        Most Popular
                      </span>
                    </div>
                  </div>
                )}

                {/* Plan Header */}
                <div className="text-center">
                  <h3 className="font-display text-2xl font-bold text-foreground">
                    {tier.name}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{tier.description}</p>

                  {/* Price */}
                  <div className="mt-8">
                    <div className="flex items-baseline justify-center gap-2">
                      <span className="font-display text-6xl font-bold tracking-tight text-foreground">
                        {formatPrice(price, tier.price.currency)}
                      </span>
                      {price > 0 && (
                        <span className="text-lg text-muted-foreground">/month</span>
                      )}
                    </div>
                    {billingCycle === 'annual' && price > 0 && (
                      <p className="mt-2 text-sm text-muted-foreground">
                        Billed {formatPrice(tier.price.annual, tier.price.currency)} annually
                      </p>
                    )}
                  </div>

                  {/* CTA Button */}
                  <Button
                    onClick={() => handlePlanClick(tier.id, tier.name, tier.cta.text)}
                    size="lg"
                    className={`mt-8 h-12 w-full font-semibold transition-all ${
                      tier.cta.variant === 'gradient'
                        ? 'bg-gradient-brand text-brand-foreground shadow-brand hover:scale-[1.02] hover:shadow-2xl'
                        : 'border-2 border-border/60 bg-background text-foreground hover:border-brand/40 hover:bg-surface'
                    }`}
                  >
                    {tier.cta.text}
                  </Button>
                </div>

                {/* Features List */}
                <div className="mt-10 flex-1">
                  <div className="space-y-4">
                    {tier.features.map((feature, idx) => (
                      <div key={idx} className="flex items-start gap-3">
                        <div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                          feature.included
                            ? 'bg-success/15 text-success'
                            : 'bg-muted/20 text-muted-foreground/30'
                        }`}>
                          <Check className="h-3.5 w-3.5" strokeWidth={3} />
                        </div>
                        <span
                          className={`text-sm leading-relaxed ${
                            feature.included ? 'text-foreground' : 'text-muted-foreground/60'
                          }`}
                        >
                          {feature.text}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* FAQ or Support Text */}
        <div className="mt-16 text-center">
          <p className="text-sm text-muted-foreground">
            Have questions about pricing?{' '}
            <button
              onClick={() => {
                analytics.track({ name: 'pricing_contact_click', params: {} });
                openDemoModal();
              }}
              className="font-semibold text-brand hover:underline"
            >
              Contact our team
            </button>
          </p>
        </div>
      </div>
    </section>
  );
}
