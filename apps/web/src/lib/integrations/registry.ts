/**
 * Integration registry for FlowERP AI.
 *
 * Centralized catalog of all integrations. Frontend UI reads from this registry.
 * Backend can later expose this via API endpoint with per-organization status.
 *
 * To enable an integration in production:
 * 1. Change status from 'coming_soon' to 'active'
 * 2. Add backend configuration in integration service
 * 3. Update documentation
 */

export type IntegrationCategory = 'communication' | 'mapping' | 'business' | 'automation' | 'ai';
export type IntegrationStatus = 'active' | 'coming_soon' | 'beta';

export interface Integration {
  id: string;
  name: string;
  description: string;
  category: IntegrationCategory;
  status: IntegrationStatus;
  icon: string; // SVG path or URL
  docsUrl?: string;
  setupRequired: boolean;
}

export const INTEGRATIONS: Integration[] = [
  // Communication
  {
    id: 'twilio',
    name: 'Twilio',
    description: 'SMS notifications for delivery updates',
    category: 'communication',
    status: 'coming_soon',
    icon: '/icons/twilio.svg',
    setupRequired: true,
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp Business',
    description: 'Send order confirmations via WhatsApp',
    category: 'communication',
    status: 'coming_soon',
    icon: '/icons/whatsapp.svg',
    setupRequired: true,
  },
  {
    id: 'telegram',
    name: 'Telegram Bot',
    description: 'Real-time notifications in Telegram',
    category: 'communication',
    status: 'coming_soon',
    icon: '/icons/telegram.svg',
    setupRequired: true,
  },
  {
    id: 'gmail',
    name: 'Gmail',
    description: 'Send invoices and receipts via Gmail',
    category: 'communication',
    status: 'coming_soon',
    icon: '/icons/gmail.svg',
    setupRequired: true,
  },
  {
    id: 'outlook',
    name: 'Outlook',
    description: 'Email integration with Microsoft 365',
    category: 'communication',
    status: 'coming_soon',
    icon: '/icons/outlook.svg',
    setupRequired: true,
  },

  // Mapping & Location
  {
    id: 'google-maps',
    name: 'Google Maps',
    description: 'Route optimization and live tracking',
    category: 'mapping',
    status: 'active',
    icon: '/icons/google-maps.svg',
    docsUrl: '/docs/integrations/google-maps',
    setupRequired: true,
  },

  // Business & Payments
  {
    id: 'stripe',
    name: 'Stripe',
    description: 'Accept payments and manage subscriptions',
    category: 'business',
    status: 'coming_soon',
    icon: '/icons/stripe.svg',
    setupRequired: true,
  },
  {
    id: 'quickbooks',
    name: 'QuickBooks',
    description: 'Sync invoices and expenses',
    category: 'business',
    status: 'coming_soon',
    icon: '/icons/quickbooks.svg',
    setupRequired: true,
  },

  // AI & Automation
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'Power the AI assistant with GPT models',
    category: 'ai',
    status: 'active',
    icon: '/icons/openai.svg',
    setupRequired: false, // Built-in
  },
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    description: 'Advanced AI reasoning for complex queries',
    category: 'ai',
    status: 'active',
    icon: '/icons/anthropic.svg',
    setupRequired: false, // Built-in
  },
  {
    id: 'zapier',
    name: 'Zapier',
    description: 'Connect to 5,000+ apps',
    category: 'automation',
    status: 'coming_soon',
    icon: '/icons/zapier.svg',
    setupRequired: true,
  },

  // Developer Tools
  {
    id: 'rest-api',
    name: 'REST API',
    description: 'Full programmatic access to FlowERP',
    category: 'automation',
    status: 'active',
    icon: '/icons/api.svg',
    docsUrl: '/docs/api',
    setupRequired: false,
  },
  {
    id: 'webhooks',
    name: 'Webhooks',
    description: 'Real-time event notifications',
    category: 'automation',
    status: 'active',
    icon: '/icons/webhooks.svg',
    docsUrl: '/docs/webhooks',
    setupRequired: false,
  },

  // Infrastructure
  {
    id: 'aws',
    name: 'AWS',
    description: 'Cloud infrastructure and storage',
    category: 'automation',
    status: 'active',
    icon: '/icons/aws.svg',
    setupRequired: false, // Backend-only
  },
];

/**
 * Get integrations by category.
 */
export function getIntegrationsByCategory(category: IntegrationCategory): Integration[] {
  return INTEGRATIONS.filter((integration) => integration.category === category);
}

/**
 * Get integration by ID.
 */
export function getIntegration(id: string): Integration | undefined {
  return INTEGRATIONS.find((integration) => integration.id === id);
}

/**
 * Get all active integrations.
 */
export function getActiveIntegrations(): Integration[] {
  return INTEGRATIONS.filter((integration) => integration.status === 'active');
}

/**
 * Category display names.
 */
export const CATEGORY_LABELS: Record<IntegrationCategory, string> = {
  communication: 'Communication',
  mapping: 'Maps & Tracking',
  business: 'Business & Payments',
  automation: 'Automation & APIs',
  ai: 'AI & Intelligence',
};
