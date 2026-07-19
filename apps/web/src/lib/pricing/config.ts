/**
 * Pricing configuration for FlowERP AI.
 *
 * Centralized pricing data that can later be fetched from backend API
 * without changing UI components. Change this config to update pricing
 * across the entire application.
 */

export interface PricingFeature {
  text: string;
  included: boolean;
}

export interface PricingTier {
  id: string;
  name: string;
  description: string;
  price: {
    monthly: number;
    annual: number;
    currency: string;
  };
  features: PricingFeature[];
  cta: {
    text: string;
    variant: 'default' | 'gradient';
  };
  popular?: boolean;
}

export const PRICING_TIERS: PricingTier[] = [
  {
    id: 'starter',
    name: 'Starter',
    description: 'For small logistics teams getting started',
    price: {
      monthly: 99,
      annual: 990, // ~17% discount
      currency: 'USD',
    },
    features: [
      { text: 'Up to 500 orders/month', included: true },
      { text: 'Up to 5 team members', included: true },
      { text: 'Basic AI assistant', included: true },
      { text: 'Order & dispatch management', included: true },
      { text: 'Real-time tracking', included: true },
      { text: 'Mobile app access', included: true },
      { text: 'Email support', included: true },
      { text: 'Route optimization', included: false },
      { text: 'Fleet management', included: false },
      { text: 'Financial reporting', included: false },
      { text: 'API access', included: false },
      { text: 'Priority support', included: false },
    ],
    cta: {
      text: 'Start Free Trial',
      variant: 'default',
    },
  },
  {
    id: 'professional',
    name: 'Professional',
    description: 'For growing fleets that need more power',
    price: {
      monthly: 299,
      annual: 2990, // ~17% discount
      currency: 'USD',
    },
    features: [
      { text: 'Up to 5,000 orders/month', included: true },
      { text: 'Up to 25 team members', included: true },
      { text: 'Advanced AI assistant', included: true },
      { text: 'Order & dispatch management', included: true },
      { text: 'Real-time tracking', included: true },
      { text: 'Mobile app access', included: true },
      { text: 'Route optimization', included: true },
      { text: 'Fleet management', included: true },
      { text: 'Financial reporting', included: true },
      { text: 'Integrations (Maps, Messaging)', included: true },
      { text: 'Priority support', included: true },
      { text: 'API access', included: false },
      { text: 'Custom integrations', included: false },
      { text: 'Dedicated account manager', included: false },
    ],
    cta: {
      text: 'Start Free Trial',
      variant: 'gradient',
    },
    popular: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    description: 'For large operations with custom needs',
    price: {
      monthly: 0, // Custom pricing
      annual: 0,
      currency: 'USD',
    },
    features: [
      { text: 'Unlimited orders', included: true },
      { text: 'Unlimited team members', included: true },
      { text: 'Full AI platform access', included: true },
      { text: 'All Professional features', included: true },
      { text: 'API access & webhooks', included: true },
      { text: 'Custom integrations', included: true },
      { text: 'White-label options', included: true },
      { text: 'On-premise deployment', included: true },
      { text: 'SLA guarantee', included: true },
      { text: 'Dedicated account manager', included: true },
      { text: '24/7 phone support', included: true },
      { text: 'Custom training & onboarding', included: true },
    ],
    cta: {
      text: 'Contact Sales',
      variant: 'default',
    },
  },
];

/**
 * Get pricing tier by ID.
 * Useful for checkout flows or plan comparison pages.
 */
export function getPricingTier(id: string): PricingTier | undefined {
  return PRICING_TIERS.find((tier) => tier.id === id);
}

/**
 * Calculate annual savings percentage.
 */
export function getAnnualSavings(tier: PricingTier): number {
  if (tier.price.monthly === 0) return 0;
  const monthlyTotal = tier.price.monthly * 12;
  const savings = monthlyTotal - tier.price.annual;
  return Math.round((savings / monthlyTotal) * 100);
}

/**
 * Format price for display.
 */
export function formatPrice(amount: number, currency: string): string {
  if (amount === 0) return 'Custom';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}
