/**
 * Cookie / tracking consent banner.
 *
 * Shown only when the visitor has not yet made a choice (and DNT is off, and
 * the feature flag is on). Wires the decision into the analytics service, which
 * then unblocks GA4 / Meta / LinkedIn via Google Consent Mode v2.
 */

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  CONSENT_ALL,
  CONSENT_ESSENTIAL,
  applyConsent,
  initConsent,
} from '@/lib/analytics/consent';
import { siteConfig } from '@/lib/site-config';

export function ConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!siteConfig.features.cookieConsent) return;
    const { needsDecision } = initConsent();
    setVisible(needsDecision);
  }, []);

  if (!visible) return null;

  const decide = (accepted: boolean) => {
    applyConsent(accepted ? CONSENT_ALL : CONSENT_ESSENTIAL);
    setVisible(false);
  };

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label="Cookie consent"
      className="fixed inset-x-0 bottom-0 z-[60] px-4 pb-4 sm:px-6 sm:pb-6"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-4 rounded-2xl border border-border/70 bg-surface/95 p-5 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-surface/80 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:p-6">
        <p className="text-sm leading-relaxed text-muted-foreground">
          We use cookies to understand traffic and improve {siteConfig.name}. You can accept
          analytics &amp; marketing cookies, or continue with only what&apos;s essential.{' '}
          <a
            href="/privacy"
            className="font-medium text-foreground underline underline-offset-2 hover:text-brand"
          >
            Privacy
          </a>
        </p>
        <div className="flex shrink-0 items-center gap-3">
          <Button
            variant="outline"
            onClick={() => decide(false)}
            className="h-10 border-border bg-background/40 text-sm font-medium"
          >
            Essential only
          </Button>
          <Button
            onClick={() => decide(true)}
            className="h-10 bg-brand px-5 text-sm font-semibold text-brand-foreground hover:bg-brand/90"
          >
            Accept all
          </Button>
        </div>
      </div>
    </div>
  );
}
