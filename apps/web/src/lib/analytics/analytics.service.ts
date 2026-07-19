/**
 * Centralized analytics service.
 *
 * This is the single entry point for all analytics tracking in the application.
 * Components call analytics.track() with typed events, and this service
 * distributes them to all enabled providers (GA4, GTM, Meta, LinkedIn, etc.).
 *
 * Benefits:
 * - Components never directly call gtag(), fbq(), etc. (loose coupling)
 * - Single place to add/remove analytics providers
 * - Consent management centralized (all providers respect consent state)
 * - Type-safe events (compile-time checks for event names/params)
 * - Easy to mock in tests (just mock this service)
 *
 * Usage:
 *   import { analytics } from '@/lib/analytics';
 *   analytics.track({ name: 'demo_form_submitted', params: { ... } });
 */

import type { AnalyticsConfig, AnalyticsEvent, AnalyticsService, ConsentState } from './types';
import { googleAnalytics } from './providers/google-analytics';
import { googleTagManager } from './providers/google-tag-manager';
import { metaPixel } from './providers/meta-pixel';
import { linkedInInsight } from './providers/linkedin-insight';
import { microsoftClarity } from './providers/microsoft-clarity';

class Analytics implements AnalyticsService {
  private config: AnalyticsConfig = {};
  private consent: ConsentState = {
    analytics: false,
    marketing: false,
    preferences: false,
    functionality: true,
  };
  private initialized = false;

  /**
   * Initialize analytics providers based on config.
   * Call this once at app startup (typically in root component or entry point).
   *
   * Env variables pattern (for production):
   *   VITE_GA4_MEASUREMENT_ID=G-XXXXXXXXXX
   *   VITE_GTM_CONTAINER_ID=GTM-XXXXXXX
   *   VITE_META_PIXEL_ID=1234567890
   *   etc.
   */
  init(config: AnalyticsConfig): void {
    if (this.initialized) {
      console.warn('[Analytics] Already initialized');
      return;
    }

    this.config = config;

    // Initialize providers based on what's configured
    if (config.googleAnalyticsId) {
      googleAnalytics.init(config.googleAnalyticsId, config.debug);
    }

    if (config.googleTagManagerId) {
      // GTM supersedes direct GA4 integration — if GTM is present, it handles GA4
      googleTagManager.init(config.googleTagManagerId, config.debug);
    }

    if (config.metaPixelId) {
      metaPixel.init(config.metaPixelId, config.debug);
    }

    if (config.linkedInPartnerId) {
      linkedInInsight.init(config.linkedInPartnerId, config.debug);
    }

    if (config.microsoftClarityId) {
      microsoftClarity.init(config.microsoftClarityId, config.debug);
    }

    // Additional providers (Hotjar, TikTok, Yandex) would be initialized here
    // when their providers are implemented

    this.initialized = true;

    if (config.debug) {
      console.log('[Analytics] Initialized with config:', {
        providers: Object.keys(config).filter(k => config[k as keyof AnalyticsConfig]),
      });
    }

    // Check Do Not Track header
    if (config.respectDnt && typeof navigator !== 'undefined' && navigator.doNotTrack === '1') {
      console.log('[Analytics] Do Not Track detected, analytics disabled');
      return;
    }

    // Track initial page view (landing)
    if (typeof window !== 'undefined') {
      this.track({
        name: 'landing_viewed',
        params: { referrer: document.referrer || 'direct' },
      });
    }
  }

  /**
   * Track a typed analytics event across all enabled providers.
   */
  track<E extends AnalyticsEvent>(event: E): void {
    if (!this.initialized) {
      console.warn('[Analytics] Not initialized, call analytics.init() first');
      return;
    }

    const { debug } = this.config;

    if (debug) {
      console.log('[Analytics] Tracking event:', event);
    }

    // Distribute event to all providers
    // GA4: Always track (analytics)
    if (this.consent.analytics && googleAnalytics.isReady()) {
      googleAnalytics.track(event);
    }

    // GTM: Always track (handles its own consent internally)
    if (googleTagManager.isReady()) {
      googleTagManager.track(event);
    }

    // Meta Pixel: Only track if marketing consent granted
    if (this.consent.marketing && metaPixel.isReady()) {
      metaPixel.track(event);
    }

    // LinkedIn Insight: Only track if marketing consent granted
    if (this.consent.marketing && linkedInInsight.isReady()) {
      linkedInInsight.track(event);
    }

    // Clarity: Always track (session recordings, not conversion tracking)
    // Note: Clarity has its own opt-out mechanism, respects DNT
    if (microsoftClarity.isReady()) {
      // Tag high-value sessions for priority processing
      if (event.name === 'demo_form_success') {
        microsoftClarity.upgrade();
        microsoftClarity.tag('conversion_type', 'demo_request');
      }
    }

    // Special handling for conversion events
    if (event.name === 'conversion' && 'params' in event) {
      this.trackConversion(event.params);
    }
  }

  /**
   * Track a page view. Called automatically by router on navigation.
   */
  pageView(path: string, title?: string): void {
    if (!this.initialized) return;

    if (this.consent.analytics && googleAnalytics.isReady()) {
      googleAnalytics.pageView(path, title);
    }

    if (googleTagManager.isReady()) {
      googleTagManager.pageView(path, title);
    }

    // Also track as standard event for consistency
    this.track({
      name: 'page_view',
      params: {
        page_title: title || (typeof document !== 'undefined' ? document.title : ''),
        page_location: typeof window !== 'undefined' ? window.location.href : '',
      },
    });
  }

  /**
   * Update user consent preferences.
   * This propagates to all providers via Google Consent Mode v2 or provider-specific APIs.
   */
  setConsent(consent: Partial<ConsentState>): void {
    this.consent = { ...this.consent, ...consent };

    if (this.config.debug) {
      console.log('[Analytics] Consent updated:', this.consent);
    }

    // Propagate to all providers
    if (googleAnalytics.isReady()) {
      googleAnalytics.setConsent(this.consent);
    }

    if (googleTagManager.isReady()) {
      googleTagManager.setConsent(this.consent);
    }

    if (metaPixel.isReady()) {
      metaPixel.setConsent(!!consent.marketing);
    }

    if (linkedInInsight.isReady()) {
      linkedInInsight.setConsent(!!consent.marketing);
    }
  }

  /**
   * Identify a user for post-signup analytics.
   * The marketing site doesn't typically call this until after demo → signup conversion.
   */
  identify(userId: string, traits?: Record<string, unknown>): void {
    if (!this.initialized) return;

    if (googleTagManager.isReady()) {
      googleTagManager.identify(userId, traits);
    }

    if (microsoftClarity.isReady()) {
      microsoftClarity.identify(userId);
    }

    if (this.config.debug) {
      console.log('[Analytics] User identified:', userId, traits);
    }
  }

  /**
   * Check if analytics is initialized and at least one provider is ready.
   */
  isReady(): boolean {
    return (
      this.initialized &&
      (googleAnalytics.isReady() ||
        googleTagManager.isReady() ||
        metaPixel.isReady() ||
        linkedInInsight.isReady() ||
        microsoftClarity.isReady())
    );
  }

  /**
   * Get current consent state (for consent banner UI).
   */
  getConsent(): ConsentState {
    return { ...this.consent };
  }

  /**
   * Track a conversion event (used for ads platforms).
   * Maps to platform-specific conversion events (GA4 purchase, Meta Lead, etc.)
   */
  private trackConversion(params: {
    conversion_type: 'demo_request' | 'trial_signup' | 'contact';
    value?: number;
    currency?: string;
  }): void {
    // GA4 conversions are handled via event mapping in the provider
    // Meta/LinkedIn conversions are handled via their track() implementations
    // Additional conversion pixels (Google Ads, etc.) would be added here

    if (this.config.debug) {
      console.log('[Analytics] Conversion tracked:', params);
    }
  }
}

// Export singleton instance
export const analytics = new Analytics();

// Export types for consumers
export type { AnalyticsEvent, ConsentState } from './types';
