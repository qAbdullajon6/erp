/**
 * Meta Pixel (Facebook Pixel) provider.
 *
 * Tracks events for Facebook Ads conversion tracking and Custom Audiences.
 * The Pixel can track conversions, build retargeting audiences, and optimize
 * ad delivery based on user behavior.
 *
 * Note: Meta requires explicit consent under GDPR. Always check consent
 * state before firing events.
 */

import type { AnalyticsEvent } from '../types';

declare global {
  interface Window {
    fbq?: {
      (
        command: 'track' | 'trackCustom' | 'init' | 'consent',
        eventName: string,
        params?: Record<string, unknown>
      ): void;
      loaded?: boolean;
      version?: string;
      queue?: unknown[];
    };
    _fbq?: Window['fbq'];
  }
}

export class MetaPixelProvider {
  private pixelId: string | null = null;
  private initialized = false;
  private debug = false;
  private consentGranted = false;

  /**
   * Initialize Meta Pixel by injecting the pixel script.
   */
  init(pixelId: string, debug = false): void {
    if (typeof window === 'undefined') return;
    if (this.initialized) {
      console.warn('[Meta Pixel] Already initialized');
      return;
    }

    this.pixelId = pixelId;
    this.debug = debug;

    // Initialize fbq function and queue
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fbq: any = function (...args: any[]) {
      if (fbq.callMethod) {
        fbq.callMethod.apply(fbq, args);
      } else {
        fbq.queue.push(args);
      }
    };
    fbq.queue = [] as any[];
    fbq.loaded = true;
    fbq.version = '2.0';

    if (!window.fbq) window.fbq = fbq;
    window._fbq = window.fbq;

    // Load pixel script
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://connect.facebook.net/en_US/fbevents.js';
    document.head.appendChild(script);

    // Initialize pixel (doesn't track yet, waits for consent)
    window.fbq?.('init', pixelId);

    // Set default consent state (revoke until user opts in)
    window.fbq?.('consent', 'revoke');

    this.initialized = true;

    if (this.debug) {
      console.log(`[Meta Pixel] Initialized with pixel ID: ${pixelId}`);
    }
  }

  /**
   * Track an event. Maps internal events to Meta's standard events where possible.
   */
  track(event: AnalyticsEvent): void {
    if (!this.initialized || !this.consentGranted || typeof window === 'undefined' || !window.fbq) {
      if (this.debug && this.initialized && !this.consentGranted) {
        console.warn('[Meta Pixel] Consent not granted, event dropped:', event);
      }
      return;
    }

    const { name, params } = event;

    // Map to Meta standard events or use custom event
    const metaEvent = this.mapEventName(name);
    const isStandard = this.isStandardEvent(metaEvent);

    if (isStandard) {
      window.fbq('track', metaEvent, params);
    } else {
      window.fbq('trackCustom', metaEvent, params);
    }

    if (this.debug) {
      console.log(`[Meta Pixel] Event tracked:`, {
        name: metaEvent,
        type: isStandard ? 'standard' : 'custom',
        params,
      });
    }
  }

  /**
   * Update consent state. Meta Pixel respects GDPR consent signals.
   */
  setConsent(granted: boolean): void {
    if (!this.initialized || typeof window === 'undefined' || !window.fbq) return;

    this.consentGranted = granted;
    window.fbq('consent', granted ? 'grant' : 'revoke');

    if (this.debug) {
      console.log(`[Meta Pixel] Consent ${granted ? 'granted' : 'revoked'}`);
    }
  }

  /**
   * Map internal event names to Meta standard events.
   * Standard events unlock automatic optimization and reporting features.
   */
  private mapEventName(name: string): string {
    const mapping: Record<string, string> = {
      demo_form_success: 'Lead', // Meta standard event
      demo_form_submitted: 'SubmitApplication',
      demo_form_started: 'InitiateCheckout',
      page_view: 'PageView',
      book_demo_click: 'Schedule',
      // Custom events use original name (trackCustom)
    };

    return mapping[name] ?? name;
  }

  /**
   * Check if event name is a Meta standard event.
   * Standard events: https://developers.facebook.com/docs/meta-pixel/reference
   */
  private isStandardEvent(name: string): boolean {
    const standardEvents = [
      'PageView',
      'Lead',
      'Schedule',
      'SubmitApplication',
      'Contact',
      'CompleteRegistration',
      'ViewContent',
      'Search',
      'AddToCart',
      'InitiateCheckout',
      'Purchase',
    ];
    return standardEvents.includes(name);
  }

  isReady(): boolean {
    return this.initialized && typeof window !== 'undefined' && !!window.fbq;
  }
}

export const metaPixel = new MetaPixelProvider();
