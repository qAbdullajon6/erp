/**
 * Integrations section component.
 *
 * Displays FlowERP AI integrations with categories and status badges.
 * Uses registry pattern so integrations can later be managed via backend API.
 */

import { INTEGRATIONS, CATEGORY_LABELS, type IntegrationCategory } from '@/lib/integrations/registry';
import { analytics } from '@/lib/analytics';
import { useSectionVisibility } from '@/lib/analytics/hooks';
import { ExternalLink } from 'lucide-react';

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

  // Group integrations by category
  const categories: IntegrationCategory[] = ['communication', 'mapping', 'business', 'ai', 'automation'];

  return (
    <section ref={sectionRef} id="integrations" className="relative border-t border-border/60 py-24">
      <div className="mx-auto max-w-7xl px-6">
        {/* Section Header */}
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="font-display text-4xl font-bold tracking-tight text-foreground md:text-5xl">
            Integrations
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            FlowERP connects with the tools you already use. More integrations added regularly.
          </p>
        </div>

        {/* Integrations by Category */}
        <div className="mt-16 space-y-12">
          {categories.map((category) => {
            const integrations = INTEGRATIONS.filter((i) => i.category === category);
            if (integrations.length === 0) return null;

            return (
              <div key={category}>
                {/* Category Title */}
                <h3 className="mb-6 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  {CATEGORY_LABELS[category]}
                </h3>

                {/* Integration Cards Grid */}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {integrations.map((integration) => {
                    const isActive = integration.status === 'active';
                    const isBeta = integration.status === 'beta';

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
                        className={`group relative flex flex-col items-start rounded-xl border p-5 text-left transition-all ${
                          isActive || integration.docsUrl
                            ? 'border-border/60 bg-surface/40 hover:border-brand/40 hover:bg-surface'
                            : 'border-border/40 bg-surface/20'
                        }`}
                      >
                        {/* Status Badge */}
                        <div className="absolute right-4 top-4">
                          {isActive && (
                            <span className="inline-flex rounded-full bg-success/15 px-2 py-0.5 text-xs font-medium text-success">
                              Active
                            </span>
                          )}
                          {isBeta && (
                            <span className="inline-flex rounded-full bg-brand/15 px-2 py-0.5 text-xs font-medium text-brand">
                              Beta
                            </span>
                          )}
                          {integration.status === 'coming_soon' && (
                            <span className="inline-flex rounded-full bg-muted/40 px-2 py-0.5 text-xs font-medium text-muted-foreground">
                              Coming Soon
                            </span>
                          )}
                        </div>

                        {/* Icon Placeholder */}
                        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-background/60 ring-1 ring-border/60">
                          <span className="text-xl font-bold text-muted-foreground">
                            {integration.name.substring(0, 2).toUpperCase()}
                          </span>
                        </div>

                        {/* Integration Name */}
                        <h4 className="mt-4 font-display text-base font-semibold text-foreground">
                          {integration.name}
                          {integration.docsUrl && (
                            <ExternalLink className="ml-1.5 inline h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                          )}
                        </h4>

                        {/* Description */}
                        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
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
        <div className="mt-16 rounded-2xl border border-border/60 bg-gradient-to-br from-brand/5 to-transparent p-8 text-center">
          <h3 className="font-display text-2xl font-bold text-foreground">
            Need a Custom Integration?
          </h3>
          <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
            Use our REST API and webhooks to build custom integrations, or contact us about Enterprise plans with dedicated integration support.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <a
              href="/docs/api"
              onClick={() => {
                analytics.track({
                  name: 'integration_docs_click',
                  params: { doc_type: 'api' },
                });
              }}
              className="inline-flex h-10 items-center justify-center rounded-lg border border-border/60 bg-background px-5 text-sm font-medium text-foreground transition-colors hover:bg-surface"
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
              className="inline-flex h-10 items-center justify-center rounded-lg border border-border/60 bg-background px-5 text-sm font-medium text-foreground transition-colors hover:bg-surface"
            >
              View Webhook Docs
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
