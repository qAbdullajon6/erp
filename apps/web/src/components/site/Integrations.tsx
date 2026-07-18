/**
 * Integrations section - Enterprise-grade design
 *
 * Premium card design with brand colors instead of letter initials.
 * Registry pattern allows easy enabling/disabling of integrations.
 */

import { INTEGRATIONS, CATEGORY_LABELS, type IntegrationCategory } from '@/lib/integrations/registry';
import { analytics } from '@/lib/analytics';
import { useSectionVisibility } from '@/lib/analytics/hooks';
import { ExternalLink, Sparkles, Zap, MessageSquare, Map, DollarSign, Bot, Code } from 'lucide-react';

// Brand color mapping for integrations
const INTEGRATION_COLORS: Record<string, { bg: string; text: string; icon: typeof Sparkles }> = {
  // Communication
  twilio: { bg: 'bg-red-500/15', text: 'text-red-500', icon: MessageSquare },
  whatsapp: { bg: 'bg-green-500/15', text: 'text-green-500', icon: MessageSquare },
  telegram: { bg: 'bg-blue-500/15', text: 'text-blue-500', icon: MessageSquare },
  gmail: { bg: 'bg-red-500/15', text: 'text-red-500', icon: MessageSquare },
  outlook: { bg: 'bg-blue-600/15', text: 'text-blue-600', icon: MessageSquare },

  // Mapping
  'google-maps': { bg: 'bg-green-600/15', text: 'text-green-600', icon: Map },

  // Business
  stripe: { bg: 'bg-purple-500/15', text: 'text-purple-500', icon: DollarSign },
  quickbooks: { bg: 'bg-green-600/15', text: 'text-green-600', icon: DollarSign },

  // AI
  openai: { bg: 'bg-emerald-500/15', text: 'text-emerald-500', icon: Bot },
  anthropic: { bg: 'bg-orange-500/15', text: 'text-orange-500', icon: Bot },

  // Automation
  zapier: { bg: 'bg-orange-500/15', text: 'text-orange-500', icon: Zap },
  'rest-api': { bg: 'bg-brand/15', text: 'text-brand', icon: Code },
  webhooks: { bg: 'bg-brand/15', text: 'text-brand', icon: Code },
  aws: { bg: 'bg-orange-600/15', text: 'text-orange-600', icon: Code },
};

export function Integrations() {
  const sectionRef = useSectionVisibility('integrations');

  const handleIntegrationClick = (integrationId: string, integrationName: string) => {
    analytics.track({
      name: 'integration_click',
      params: {
        integration_id: integrationId,
        integration_name: integrationName,
      },
    });
  };

  const categories: IntegrationCategory[] = ['communication', 'mapping', 'business', 'ai', 'automation'];

  return (
    <section ref={sectionRef} id="integrations" className="relative border-t border-border/60 py-32">
      <div className="mx-auto max-w-7xl px-6">
        {/* Section Header */}
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand/10 px-4 py-1.5 text-xs font-semibold text-brand backdrop-blur">
            <Sparkles className="h-3.5 w-3.5" />
            Integrations
          </div>
          <h2 className="mt-5 font-display text-5xl font-bold tracking-tight text-foreground md:text-6xl">
            Connect Your Stack
          </h2>
          <p className="mt-5 text-lg text-muted-foreground">
            FlowERP works with the tools you already use. More integrations added regularly.
          </p>
        </div>

        {/* Integrations by Category */}
        <div className="mt-20 space-y-16">
          {categories.map((category) => {
            const integrations = INTEGRATIONS.filter((i) => i.category === category);
            if (integrations.length === 0) return null;

            return (
              <div key={category}>
                {/* Category Title */}
                <h3 className="mb-8 text-sm font-bold uppercase tracking-wider text-muted-foreground">
                  {CATEGORY_LABELS[category]}
                </h3>

                {/* Integration Cards Grid */}
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                  {integrations.map((integration) => {
                    const isActive = integration.status === 'active';
                    const isBeta = integration.status === 'beta';
                    const colors = INTEGRATION_COLORS[integration.id] || { bg: 'bg-muted/20', text: 'text-muted-foreground', icon: Sparkles };
                    const Icon = colors.icon;

                    return (
                      <button
                        key={integration.id}
                        onClick={() => {
                          handleIntegrationClick(integration.id, integration.name);
                          if (integration.docsUrl) {
                            window.open(integration.docsUrl, '_blank', 'noopener,noreferrer');
                          }
                        }}
                        disabled={!integration.docsUrl && !isActive}
                        className={`group relative flex flex-col items-start rounded-2xl border p-6 text-left transition-all ${
                          isActive || integration.docsUrl
                            ? 'border-border/60 bg-surface/40 hover:-translate-y-1 hover:border-brand/40 hover:bg-surface hover:shadow-xl'
                            : 'border-border/40 bg-surface/20 cursor-not-allowed opacity-60'
                        }`}
                      >
                        {/* Status Badge */}
                        <div className="absolute right-5 top-5">
                          {isActive && (
                            <div className="relative">
                              <div className="absolute inset-0 rounded-full bg-success/30 blur-md" />
                              <span className="relative inline-flex rounded-full bg-success/15 px-3 py-1 text-xs font-bold text-success">
                                Active
                              </span>
                            </div>
                          )}
                          {isBeta && (
                            <span className="inline-flex rounded-full bg-brand/15 px-3 py-1 text-xs font-bold text-brand">
                              Beta
                            </span>
                          )}
                          {integration.status === 'coming_soon' && (
                            <span className="inline-flex rounded-full bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground">
                              Soon
                            </span>
                          )}
                        </div>

                        {/* Icon */}
                        <div className={`flex h-14 w-14 items-center justify-center rounded-xl ${colors.bg} transition-transform group-hover:scale-110`}>
                          <Icon className={`h-7 w-7 ${colors.text}`} />
                        </div>

                        {/* Integration Name */}
                        <h4 className="mt-5 flex items-center gap-2 font-display text-lg font-bold text-foreground">
                          {integration.name}
                          {integration.docsUrl && (
                            <ExternalLink className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
                          )}
                        </h4>

                        {/* Description */}
                        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                          {integration.description}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* API & Custom Integrations CTA */}
        <div className="mt-24 overflow-hidden rounded-3xl border border-brand/30 bg-gradient-to-br from-brand/10 via-brand/5 to-transparent p-12 text-center shadow-2xl">
          <div className="absolute inset-0 bg-grid-white/5 [mask-image:radial-gradient(white,transparent_70%)]" />
          <div className="relative">
            <h3 className="font-display text-3xl font-bold text-foreground">
              Need a Custom Integration?
            </h3>
            <p className="mx-auto mt-4 max-w-2xl text-lg leading-relaxed text-muted-foreground">
              Use our REST API and webhooks to build custom integrations, or contact us about Enterprise plans with dedicated integration support.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <a
                href="/docs/api"
                onClick={() => {
                  analytics.track({
                    name: 'integration_docs_click',
                    params: { doc_type: 'api' },
                  });
                }}
                className="inline-flex h-12 items-center justify-center rounded-xl border-2 border-border/60 bg-background px-6 font-semibold text-foreground transition-all hover:border-brand/40 hover:bg-surface hover:shadow-lg"
              >
                View API Docs
              </a>
              <a
                href="/docs/webhooks"
                onClick={() => {
                  analytics.track({
                    name: 'integration_docs_click',
                    params: { doc_type: 'webhooks' },
                  });
                }}
                className="inline-flex h-12 items-center justify-center rounded-xl border-2 border-border/60 bg-background px-6 font-semibold text-foreground transition-all hover:border-brand/40 hover:bg-surface hover:shadow-lg"
              >
                View Webhook Docs
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
