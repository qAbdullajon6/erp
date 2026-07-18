/**
 * Analytics module entry point.
 *
 * Export the centralized analytics service and types.
 * Components should only import from this file, never directly from providers.
 */

export { analytics } from './analytics.service';
export type { AnalyticsEvent, AnalyticsConfig, ConsentState } from './types';
