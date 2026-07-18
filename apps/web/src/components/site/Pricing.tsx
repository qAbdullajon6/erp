/**
 * Pricing section component.
 *
 * Displays FlowERP AI pricing tiers with feature comparison.
 * Uses config-driven architecture so pricing can later come from backend API.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Check, X } from 'lucide-react';
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

    if (ctaText === 'Contact Sales') {
      openDemoModal();
    } else {
      // Free trial flow - for now, open demo modal
      // Later: redirect to /signup?plan={planId}&billing={billingCycle}
      openDemoModal();
    }
  };

  const handleBillingToggle = (cycle: 'monthly' | 'annual') => {
    setBillingCycle(cycle);
    analytics.track({
      name: 'pricing_billing_toggle',
      params: { billing_cycle: cycle },
    });
  };

  return (
    <section ref={sectionRef} id="pricing" className="relative py-24">
      <div className="mx-auto max-w-7xl px-6">
        {/* Section Header */}
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="font-display text-4xl font-bold tracking-tight text-foreground md:text-5xl">
            Simple, Transparent Pricing
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Choose the plan that fits your fleet size. All plans include a 14-day free trial.
          </p>

          {/* Billing Cycle Toggle */}
          <div className="mt-8 inline-flex items-center gap-3 rounded-full border border-border/60 bg-surface/60 p-1 backdrop-blur">
            <button
              onClick={() => handleBillingToggle('monthly')}
              className={`rounded-full px-6 py-2 text-sm font-medium transition-all ${
                billingCycle === 'monthly'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => handleBillingToggle('annual')}
              className={`rounded-full px-6 py-2 text-sm font-medium transition-all ${
                billingCycle === 'annual'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Annual
              <span className="ml-2 rounded-full bg-success/15 px-2 py-0.5 text-xs text-success">
                Save {getAnnualSavings(PRICING_TIERS[1])}%
              </span>
            </button>
          </div>
        </div>

        {/* Pricing Cards */}
        <div className="mt-16 grid gap-8 lg:grid-cols-3">
          {PRICING_TIERS.map((tier) => {
            const price =
              billingCycle === 'monthly' ? tier.price.monthly : tier.price.annual / 12;
            const isPopular = tier.popular;

            return (
              <div
                key={tier.id}
                className={`relative rounded-2xl border p-8 ${
                  isPopular
                    ? 'border-brand bg-gradient-to-b from-brand/5 to-transparent shadow-lg'
                    : 'border-border/60 bg-surface/40'
                }`}
              >
                {/* Popular Badge */}
                {isPopular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <span className="inline-flex rounded-full bg-gradient-brand px-4 py-1 text-xs font-semibold text-brand-foreground shadow-brand">
                      Most Popular
                    </span>
                  </div>
                )}

                {/* Plan Header */}
                <div className="text-center">
                  <h3 className="font-display text-2xl font-bold text-foreground">
                    {tier.name}
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground">{tier.description}</p>

                  {/* Price */}
                  <div className="mt-6">
                    <div className="flex items-baseline justify-center gap-1">
                      <span className="text-5xl font-bold tracking-tight text-foreground">
                        {formatPrice(price, tier.price.currency)}
                      </span>
                      {price > 0 && (
                        <span className="text-muted-foreground">/month</span>
                      )}
                    </div>
                    {billingCycle === 'annual' && price > 0 && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Billed {formatPrice(tier.price.annual, tier.price.currency)} annually
                      </p>
                    )}
                  </div>

                  {/* CTA Button */}
                  <Button
                    onClick={() => handlePlanClick(tier.id, tier.name, tier.cta.text)}
                    size="lg"
                    className={`mt-6 h-11 w-full ${
                      tier.cta.variant === 'gradient'
                        ? 'bg-gradient-brand text-brand-foreground shadow-brand hover:opacity-90'
                        : 'bg-background text-foreground hover:bg-surface'
                    }`}
                  >
                    {tier.cta.text}
                  </Button>
                </div>

                {/* Features List */}
                <ul className="mt-8 space-y-3">
                  {tier.features.map((feature, idx) => (
                    <li key={idx} className="flex items-start gap-3">
                      {feature.included ? (
                        <Check className="h-5 w-5 shrink-0 text-success" />
                      ) : (
                        <X className="h-5 w-5 shrink-0 text-muted-foreground/40" />
                      )}
                      <span
                        className={`text-sm ${
                          feature.included ? 'text-foreground' : 'text-muted-foreground'
                        }`}
                      >
                        {feature.text}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        {/* FAQ or Support Text */}
        <p className="mt-12 text-center text-sm text-muted-foreground">
          Have questions about pricing?{' '}
          <button
            onClick={() => {
              analytics.track({ name: 'pricing_contact_click', params: {} });
              openDemoModal();
            }}
            className="font-medium text-brand hover:underline"
          >
            Contact our team
          </button>
        </p>
      </div>
    </section>
  );
}
