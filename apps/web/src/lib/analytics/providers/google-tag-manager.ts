/**
 * Google Tag Manager (GTM) provider.
 *
 * GTM acts as a tag orchestration layer — instead of hardcoding GA4, Meta Pixel,
 * etc. into the app, you configure them in the GTM UI. This provider pushes
 * events to the dataLayer, and GTM handles distribution to configured tags.
 *
 * Why use GTM:
 * - Marketers can add/configure tags without code deploys
 * - Centralized consent management (Google Consent Mode v2)
 * - A/B testing and conditional tag firing
 * - Easier debugging (GTM Preview mode)
 *
 * Trade-off: Adds ~28KB overhead + learning curve for non-technical team.
 */

import type { AnalyticsEvent, ConsentState } from '../types';

declare global {
  interface Window {
    dataLayer?: unknown[];
  }
}

export class GoogleTagManagerProvider {
  private containerId: string | null = null;
  private initialized = false;
  private debug = false;

  /**
   * Initialize GTM by injecting the container snippet.
   * This must run before any events are pushed to dataLayer.
   */
  init(containerId: string, debug = false): void {
    if (typeof window === 'undefined') return;
    if (this.initialized) {
      console.warn('[GTM] Already initialized');
      return;
    }

    this.containerId = containerId;
    this.debug = debug;

    // Initialize dataLayer
    window.dataLayer = window.dataLayer || [];

    // Push initial consent state (Google Consent Mode v2)
    window.dataLayer.push({
      event: 'consent_default',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      analytics_storage: 'denied',
      functionality_storage: 'granted',
      personalization_storage: 'denied',
      security_storage: 'granted',
      wait_for_update: 500, // Wait 500ms for consent banner interaction
    });

    // Inject GTM script
    const script = document.createElement('script');
    script.innerHTML = `
      (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
      new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
      j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
      'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
      })(window,document,'script','dataLayer','${containerId}');
    `;
    document.head.insertBefore(script, document.head.firstChild);

    // Inject GTM noscript fallback
    const noscript = document.createElement('noscript');
    noscript.innerHTML = `<iframe src="https://www.googletagmanager.com/ns.html?id=${containerId}" height="0" width="0" style="display:none;visibility:hidden"></iframe>`;
    document.body.insertBefore(noscript, document.body.firstChild);

    this.initialized = true;

    if (this.debug) {
      console.log(`[GTM] Initialized with container: ${containerId}`);
    }
  }

  /**
   * Push an event to the dataLayer. GTM will distribute it to configured tags
   * (GA4, Meta Pixel, LinkedIn, etc.) based on tag triggers.
   */
  track(event: AnalyticsEvent): void {
    if (!this.initialized || typeof window === 'undefined' || !window.dataLayer) {
      if (this.debug) {
        console.warn('[GTM] Not initialized, event dropped:', event);
      }
      return;
    }

    window.dataLayer.push({
      event: event.name,
      ...event.params,
      timestamp: Date.now(),
    });

    if (this.debug) {
      console.log(`[GTM] Event pushed to dataLayer:`, event);
    }
  }

  /**
   * Push a page view event. GTM can be configured to forward this to GA4, Meta, etc.
   */
  pageView(path: string, title?: string): void {
    if (!this.initialized || typeof window === 'undefined' || !window.dataLayer) return;

    window.dataLayer.push({
      event: 'page_view',
      page_path: path,
      page_title: title || document.title,
      page_location: window.location.href,
    });

    if (this.debug) {
      console.log(`[GTM] Page view pushed: ${path}`);
    }
  }

  /**
   * Update consent state via dataLayer (Google Consent Mode v2).
   * GTM propagates this to all tags that respect consent signals.
   */
  setConsent(consent: Partial<ConsentState>): void {
    if (!this.initialized || typeof window === 'undefined' || !window.dataLayer) return;

    window.dataLayer.push({
      event: 'consent_update',
      ad_storage: consent.marketing ? 'granted' : 'denied',
      ad_user_data: consent.marketing ? 'granted' : 'denied',
      ad_personalization: consent.marketing ? 'granted' : 'denied',
      analytics_storage: consent.analytics ? 'granted' : 'denied',
      personalization_storage: consent.preferences ? 'granted' : 'denied',
    });

    if (this.debug) {
      console.log('[GTM] Consent updated via dataLayer:', consent);
    }
  }

  /**
   * Push user identification to dataLayer (for post-signup tracking).
   */
  identify(userId: string, traits?: Record<string, unknown>): void {
    if (!this.initialized || typeof window === 'undefined' || !window.dataLayer) return;

    window.dataLayer.push({
      event: 'user_identified',
      user_id: userId,
      ...traits,
    });

    if (this.debug) {
      console.log('[GTM] User identified:', userId);
    }
  }

  isReady(): boolean {
    return this.initialized && typeof window !== 'undefined' && !!window.dataLayer;
  }
}

export const googleTagManager = new GoogleTagManagerProvider();
