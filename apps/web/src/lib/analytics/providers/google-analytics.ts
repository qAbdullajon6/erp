/**
 * Google Analytics 4 (GA4) provider.
 *
 * Handles gtag.js initialization, event tracking, and Google Consent Mode v2.
 * Unlike Universal Analytics (gtag('event')), GA4 uses a measurement protocol
 * optimized for event-based tracking rather than page-based sessions.
 */

import type { AnalyticsEvent, ConsentState } from '../types';

declare global {
  interface Window {
    gtag?: (
      command: 'config' | 'event' | 'consent' | 'set',
      targetOrAction: string,
      params?: Record<string, unknown>
    ) => void;
    dataLayer?: unknown[];
  }
}

export class GoogleAnalyticsProvider {
  private measurementId: string | null = null;
  private initialized = false;
  private debug = false;

  /**
   * Initialize GA4 by injecting gtag.js script and configuring measurement ID.
   * This must be called before any events are tracked.
   */
  init(measurementId: string, debug = false): void {
    if (typeof window === 'undefined') return;
    if (this.initialized) {
      console.warn('[GA4] Already initialized');
      return;
    }

    this.measurementId = measurementId;
    this.debug = debug;

    // Initialize dataLayer (gtag depends on it)
    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer!.push(arguments);
    };

    // Set default consent state (denied until user opts in)
    window.gtag('consent', 'default', {
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      analytics_storage: 'denied',
      functionality_storage: 'granted', // Non-tracking cookies
      personalization_storage: 'denied',
      security_storage: 'granted',
    });

    // Load gtag.js asynchronously
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
    document.head.appendChild(script);

    // Configure GA4 measurement
    window.gtag('config', measurementId, {
      send_page_view: false, // We'll send page views manually from router
      cookie_flags: 'SameSite=None;Secure',
      anonymize_ip: true, // GDPR compliance
      allow_google_signals: false, // Disabled until user consents to marketing
    });

    this.initialized = true;

    if (this.debug) {
      console.log(`[GA4] Initialized with measurement ID: ${measurementId}`);
    }
  }

  /**
   * Track a typed analytics event. Maps our internal event schema to GA4's
   * recommended event names and parameters.
   */
  track(event: AnalyticsEvent): void {
    if (!this.initialized || typeof window === 'undefined' || !window.gtag) {
      if (this.debug) {
        console.warn('[GA4] Not initialized, event dropped:', event);
      }
      return;
    }

    const { name, params } = event;

    // Map internal events to GA4 recommended events where possible
    const ga4EventName = this.mapEventName(name);

    window.gtag('event', ga4EventName, {
      ...params,
      event_category: this.categorizeEvent(name),
      timestamp: Date.now(),
    });

    if (this.debug) {
      console.log(`[GA4] Event tracked:`, { name: ga4EventName, params });
    }
  }

  /**
   * Track a page view. GA4 automatically tracks the first page load, but
   * SPAs need to manually track subsequent navigations.
   */
  pageView(path: string, title?: string): void {
    if (!this.initialized || typeof window === 'undefined' || !window.gtag) return;

    window.gtag('event', 'page_view', {
      page_path: path,
      page_title: title || document.title,
      page_location: window.location.href,
    });

    if (this.debug) {
      console.log(`[GA4] Page view tracked: ${path}`);
    }
  }

  /**
   * Update consent state for Google Consent Mode v2.
   * This tells GA4 whether it can use cookies and collect data.
   */
  setConsent(consent: Partial<ConsentState>): void {
    if (!this.initialized || typeof window === 'undefined' || !window.gtag) return;

    window.gtag('consent', 'update', {
      ad_storage: consent.marketing ? 'granted' : 'denied',
      ad_user_data: consent.marketing ? 'granted' : 'denied',
      ad_personalization: consent.marketing ? 'granted' : 'denied',
      analytics_storage: consent.analytics ? 'granted' : 'denied',
      personalization_storage: consent.preferences ? 'granted' : 'denied',
    });

    // Update allow_google_signals based on marketing consent
    if (this.measurementId) {
      window.gtag('config', this.measurementId, {
        allow_google_signals: consent.marketing ?? false,
      });
    }

    if (this.debug) {
      console.log('[GA4] Consent updated:', consent);
    }
  }

  /**
   * Map internal event names to GA4 recommended events.
   * GA4 has predefined events (search, purchase, login) that unlock
   * automatic reports. Use them when possible.
   */
  private mapEventName(name: string): string {
    const mapping: Record<string, string> = {
      demo_form_success: 'generate_lead', // GA4 recommended event
      demo_form_submitted: 'form_submit',
      demo_form_started: 'form_start',
      book_demo_click: 'generate_lead',
      outbound_link: 'click',
      video_played: 'video_start',
    };

    return mapping[name] ?? name;
  }

  /**
   * Categorize events for reporting. GA4 doesn't require categories
   * (unlike UA), but they're useful for custom reports.
   */
  private categorizeEvent(name: string): string {
    if (name.includes('form')) return 'forms';
    if (name.includes('cta') || name.includes('click')) return 'engagement';
    if (name.includes('scroll') || name.includes('section')) return 'engagement';
    if (name.includes('page') || name.includes('landing')) return 'navigation';
    if (name.includes('video')) return 'media';
    return 'other';
  }

  isReady(): boolean {
    return this.initialized && typeof window !== 'undefined' && !!window.gtag;
  }
}

export const googleAnalytics = new GoogleAnalyticsProvider();
