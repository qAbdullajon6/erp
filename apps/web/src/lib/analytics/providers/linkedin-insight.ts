/**
 * LinkedIn Insight Tag provider.
 *
 * Tracks conversions for LinkedIn Ads and builds matched audiences for retargeting.
 * Useful for B2B SaaS companies advertising to decision-makers on LinkedIn.
 */

import type { AnalyticsEvent } from '../types';

declare global {
  interface Window {
    _linkedin_data_partner_ids?: string[];
    lintrk?: (command: string, params?: Record<string, unknown>) => void;
  }
}

export class LinkedInInsightProvider {
  private partnerId: string | null = null;
  private initialized = false;
  private debug = false;
  private consentGranted = false;

  /**
   * Initialize LinkedIn Insight Tag.
   */
  init(partnerId: string, debug = false): void {
    if (typeof window === 'undefined') return;
    if (this.initialized) {
      console.warn('[LinkedIn Insight] Already initialized');
      return;
    }

    this.partnerId = partnerId;
    this.debug = debug;

    // Initialize partner IDs array
    window._linkedin_data_partner_ids = window._linkedin_data_partner_ids || [];
    window._linkedin_data_partner_ids.push(partnerId);

    // Load insight tag script
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://snap.licdn.com/li.lms-analytics/insight.min.js';
    document.head.appendChild(script);

    this.initialized = true;

    if (this.debug) {
      console.log(`[LinkedIn Insight] Initialized with partner ID: ${partnerId}`);
    }
  }

  /**
   * Track a conversion event.
   */
  track(event: AnalyticsEvent): void {
    if (!this.initialized || !this.consentGranted || typeof window === 'undefined' || !window.lintrk) {
      if (this.debug && this.initialized && !this.consentGranted) {
        console.warn('[LinkedIn Insight] Consent not granted, event dropped:', event);
      }
      return;
    }

    const { name } = event;

    // LinkedIn primarily tracks conversions, not engagement events
    if (this.isConversionEvent(name)) {
      // Map to LinkedIn conversion ID (configured in Campaign Manager)
      // In production, you'd map specific events to conversion IDs
      window.lintrk('track', { conversion_id: this.getConversionId(name) });

      if (this.debug) {
        console.log(`[LinkedIn Insight] Conversion tracked: ${name}`);
      }
    }
  }

  /**
   * Update consent state.
   */
  setConsent(granted: boolean): void {
    this.consentGranted = granted;

    if (this.debug) {
      console.log(`[LinkedIn Insight] Consent ${granted ? 'granted' : 'revoked'}`);
    }
  }

  /**
   * Check if event should be tracked as a LinkedIn conversion.
   */
  private isConversionEvent(name: string): boolean {
    return ['demo_form_success', 'demo_form_submitted', 'book_demo_click'].includes(name);
  }

  /**
   * Map event names to LinkedIn Conversion IDs.
   * In production, these would be actual conversion IDs from Campaign Manager.
   */
  private getConversionId(name: string): number {
    // Placeholder — replace with real conversion IDs from LinkedIn Campaign Manager
    const mapping: Record<string, number> = {
      demo_form_success: 1234567,
      demo_form_submitted: 1234568,
      book_demo_click: 1234569,
    };
    return mapping[name] ?? 0;
  }

  isReady(): boolean {
    return this.initialized && typeof window !== 'undefined' && !!window.lintrk;
  }
}

export const linkedInInsight = new LinkedInInsightProvider();
