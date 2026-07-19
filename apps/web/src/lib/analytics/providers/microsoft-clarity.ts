/**
 * Microsoft Clarity provider.
 *
 * Session recording and heatmap tool. Unlike analytics pixels (GA4, Meta),
 * Clarity doesn't track conversions — it records user sessions for UX analysis.
 *
 * Use cases:
 * - Identify UX issues (rage clicks, dead clicks, excessive scrolling)
 * - Watch actual user sessions navigating the landing page
 * - Heatmaps showing where users click, scroll, and hesitate
 *
 * Privacy: Clarity automatically masks sensitive form inputs (passwords, credit cards).
 */

declare global {
  interface Window {
    clarity?: {
      (command: string, ...args: unknown[]): void;
      q?: unknown[];
    };
  }
}

export class MicrosoftClarityProvider {
  private projectId: string | null = null;
  private initialized = false;
  private debug = false;

  /**
   * Initialize Microsoft Clarity by injecting the tracking script.
   */
  init(projectId: string, debug = false): void {
    if (typeof window === 'undefined') return;
    if (this.initialized) {
      console.warn('[Clarity] Already initialized');
      return;
    }

    this.projectId = projectId;
    this.debug = debug;

    // Inject Clarity script
    const script = document.createElement('script');
    script.innerHTML = `
      (function(c,l,a,r,i,t,y){
        c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
        t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
        y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
      })(window, document, "clarity", "script", "${projectId}");
    `;
    document.head.appendChild(script);

    this.initialized = true;

    if (this.debug) {
      console.log(`[Clarity] Initialized with project ID: ${projectId}`);
    }
  }

  /**
   * Tag a session with custom metadata.
   * Useful for segmenting recordings (e.g., "demo_requested", "high_intent").
   */
  tag(key: string, value: string | string[]): void {
    if (!this.initialized || typeof window === 'undefined' || !window.clarity) return;

    window.clarity('set', key, value);

    if (this.debug) {
      console.log(`[Clarity] Session tagged: ${key} = ${value}`);
    }
  }

  /**
   * Identify a user (for post-signup tracking).
   * Allows you to filter recordings by user ID in Clarity dashboard.
   */
  identify(userId: string): void {
    if (!this.initialized || typeof window === 'undefined' || !window.clarity) return;

    window.clarity('identify', userId);

    if (this.debug) {
      console.log(`[Clarity] User identified: ${userId}`);
    }
  }

  /**
   * Upgrade the current session to "high priority".
   * Clarity records all sessions but only processes a sample. This ensures
   * critical sessions (e.g., demo submissions) are always included.
   */
  upgrade(): void {
    if (!this.initialized || typeof window === 'undefined' || !window.clarity) return;

    window.clarity('upgrade');

    if (this.debug) {
      console.log('[Clarity] Session upgraded to high priority');
    }
  }

  isReady(): boolean {
    return this.initialized && typeof window !== 'undefined' && !!window.clarity;
  }
}

export const microsoftClarity = new MicrosoftClarityProvider();
