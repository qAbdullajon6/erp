/**
 * Analytics event types and tracking infrastructure.
 *
 * This module defines the contract for all analytics events tracked across
 * the marketing site. Events flow through a centralized analytics service
 * that dispatches to multiple providers (GA4, Meta Pixel, LinkedIn, etc.)
 * without coupling components to specific tracking implementations.
 */

export type AnalyticsProvider =
  | 'google-analytics'
  | 'google-ads'
  | 'meta-pixel'
  | 'linkedin-insight'
  | 'microsoft-clarity'
  | 'hotjar'
  | 'tiktok-pixel'
  | 'yandex-metrica';

export interface AnalyticsConfig {
  /** Google Analytics 4 Measurement ID (G-XXXXXXXXXX) */
  googleAnalyticsId?: string;
  /** Google Tag Manager Container ID (GTM-XXXXXXX) */
  googleTagManagerId?: string;
  /** Google Ads Conversion ID (AW-XXXXXXXXXX) */
  googleAdsId?: string;
  /** Meta Pixel ID */
  metaPixelId?: string;
  /** LinkedIn Partner ID */
  linkedInPartnerId?: string;
  /** Microsoft Clarity Project ID */
  microsoftClarityId?: string;
  /** Hotjar Site ID */
  hotjarId?: string;
  /** TikTok Pixel ID */
  tiktokPixelId?: string;
  /** Yandex Metrica Counter ID */
  yandexMetricaId?: string;
  /** Enable debug logging */
  debug?: boolean;
  /** Respect Do Not Track header */
  respectDnt?: boolean;
}

/**
 * Standard analytics events tracked on the marketing site.
 * Typed to ensure consistency across all tracking calls.
 */
export type AnalyticsEvent =
  // Page events
  | { name: 'page_view'; params: { page_title: string; page_location: string } }
  | { name: 'landing_viewed'; params: { referrer?: string } }

  // Navigation events
  | { name: 'nav_click'; params: { link_text: string; link_url: string } }
  | { name: 'cta_click'; params: { cta_text: string; cta_location: string } }
  | { name: 'hero_cta_click'; params: { cta_text: string } }
  | { name: 'book_demo_click'; params: { source: string } }
  | { name: 'pricing_click'; params: { source: string } }
  | { name: 'feature_card_click'; params: { feature_name: string } }

  // Pricing events
  | { name: 'pricing_plan_click'; params: { plan_id: string; plan_name: string; billing_cycle: string; cta_text: string } }
  | { name: 'pricing_billing_toggle'; params: { billing_cycle: string } }
  | { name: 'pricing_contact_click'; params: Record<string, never> }

  // Integration events
  | { name: 'integration_click'; params: { integration_id: string; integration_name: string } }
  | { name: 'integration_docs_click'; params: { doc_type: string } }

  // Demo form events
  | { name: 'demo_form_started'; params: Record<string, never> }
  | { name: 'demo_form_submitted'; params: {
      company_size?: string;
      use_case?: string;
      timeline?: string;
    }}
  | { name: 'demo_form_success'; params: Record<string, never> }
  | { name: 'demo_form_error'; params: { error_message: string } }

  // Engagement events
  | { name: 'scroll_depth'; params: { depth_percentage: number } }
  | { name: 'section_visible'; params: { section_name: string } }
  | { name: 'outbound_link'; params: { link_url: string; link_domain: string } }
  | { name: 'video_played'; params: { video_title: string; video_url: string } }
  | { name: 'faq_opened'; params: { question: string } }

  // Conversion events (for ads platforms)
  | { name: 'conversion'; params: {
      conversion_type: 'demo_request' | 'trial_signup' | 'contact';
      value?: number;
      currency?: string;
    }};

export interface ConsentState {
  analytics: boolean;
  marketing: boolean;
  preferences: boolean;
  functionality: boolean;
}

export interface AnalyticsService {
  /**
   * Initialize analytics providers with config.
   * Must be called before tracking any events.
   */
  init(config: AnalyticsConfig): void;

  /**
   * Track a typed analytics event across all enabled providers.
   */
  track<E extends AnalyticsEvent>(event: E): void;

  /**
   * Track a page view. Called automatically by router, but can be
   * called manually for SPAs or virtual page views.
   */
  pageView(path: string, title?: string): void;

  /**
   * Update user consent preferences (GDPR, Google Consent Mode v2).
   * All tracking respects these settings.
   */
  setConsent(consent: Partial<ConsentState>): void;

  /**
   * Identify a user (for authenticated analytics post-signup).
   * Marketing site typically doesn't call this until after demo → signup.
   */
  identify(userId: string, traits?: Record<string, unknown>): void;

  /**
   * Check if analytics is initialized and ready.
   */
  isReady(): boolean;
}
