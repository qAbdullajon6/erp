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
      const conversionId = this.getConversionId(name);
      if (!conversionId) {
        if (this.debug) {
          console.warn(`[LinkedIn Insight] No conversion ID configured for ${name}, skipped`);
        }
        return;
      }
      window.lintrk('track', { conversion_id: conversionId });

      if (this.debug) {
        console.log(`[LinkedIn Insight] Conversion tracked: ${name} (${conversionId})`);
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
   * Map event names to LinkedIn Conversion IDs from env.
   * Set VITE_LINKEDIN_CONVERSION_<EVENT> to a numeric Campaign Manager ID.
   * Returns 0 when unset — callers must skip tracking for 0.
   */
  private getConversionId(name: string): number {
    const envMap: Record<string, string | undefined> = {
      demo_form_success: import.meta.env.VITE_LINKEDIN_CONVERSION_DEMO_SUCCESS,
      demo_form_submitted: import.meta.env.VITE_LINKEDIN_CONVERSION_DEMO_SUBMITTED,
      book_demo_click: import.meta.env.VITE_LINKEDIN_CONVERSION_BOOK_DEMO,
    };
    const raw = envMap[name]?.trim();
    if (!raw) return 0;
    const id = Number.parseInt(raw, 10);
    return Number.isFinite(id) && id > 0 ? id : 0;
  }

  isReady(): boolean {
    return this.initialized && typeof window !== 'undefined' && !!window.lintrk;
  }
}

export const linkedInInsight = new LinkedInInsightProvider();
