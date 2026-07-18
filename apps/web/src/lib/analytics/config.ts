/**
 * Analytics configuration from environment variables.
 *
 * All analytics provider IDs are loaded from VITE_* env variables.
 * This keeps sensitive tracking IDs out of the codebase.
 *
 * Local development (.env.development):
 *   Leave empty or use test/debug IDs
 *
 * Production (.env.production or deployment env vars):
 *   VITE_GA4_MEASUREMENT_ID=G-XXXXXXXXXX
 *   VITE_GTM_CONTAINER_ID=GTM-XXXXXXX
 *   VITE_META_PIXEL_ID=123456789012345
 *   VITE_LINKEDIN_PARTNER_ID=1234567
 *   VITE_CLARITY_PROJECT_ID=abcdefghij
 */

import type { AnalyticsConfig } from './types';

export function getAnalyticsConfig(): AnalyticsConfig {
  return {
    // Google Analytics 4
    googleAnalyticsId: import.meta.env.VITE_GA4_MEASUREMENT_ID,

    // Google Tag Manager (recommended over direct GA4 for production)
    googleTagManagerId: import.meta.env.VITE_GTM_CONTAINER_ID,

    // Google Ads (for conversion tracking)
    googleAdsId: import.meta.env.VITE_GOOGLE_ADS_ID,

    // Meta (Facebook) Pixel
    metaPixelId: import.meta.env.VITE_META_PIXEL_ID,

    // LinkedIn Insight Tag
    linkedInPartnerId: import.meta.env.VITE_LINKEDIN_PARTNER_ID,

    // Microsoft Clarity
    microsoftClarityId: import.meta.env.VITE_CLARITY_PROJECT_ID,

    // Hotjar (when implemented)
    hotjarId: import.meta.env.VITE_HOTJAR_ID,

    // TikTok Pixel (when implemented)
    tiktokPixelId: import.meta.env.VITE_TIKTOK_PIXEL_ID,

    // Yandex Metrica (when implemented)
    yandexMetricaId: import.meta.env.VITE_YANDEX_METRICA_ID,

    // Enable debug logging in development
    debug: import.meta.env.DEV,

    // Respect Do Not Track header
    respectDnt: import.meta.env.PROD,
  };
}
