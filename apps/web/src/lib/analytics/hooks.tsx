/**
 * React hooks for analytics tracking.
 *
 * Provides declarative, React-idiomatic ways to track analytics events
 * without directly calling the analytics service from components.
 */

import { useEffect, useRef, useCallback } from 'react';
import { analytics, type AnalyticsEvent } from './index';

/**
 * Track an event when a component mounts.
 *
 * Example:
 *   useAnalyticsMount({ name: 'landing_viewed', params: {} });
 */
export function useAnalyticsMount<E extends AnalyticsEvent>(event: E): void {
  const tracked = useRef(false);

  useEffect(() => {
    if (!tracked.current) {
      analytics.track(event);
      tracked.current = true;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}

/**
 * Get a callback to track an event (for button clicks, form submissions, etc.).
 *
 * Example:
 *   const trackClick = useAnalyticsEvent({ name: 'cta_click', params: { cta_text: 'Book Demo' } });
 *   <Button onClick={trackClick}>Book Demo</Button>
 */
export function useAnalyticsEvent<E extends AnalyticsEvent>(
  event: E | ((e: React.SyntheticEvent) => E)
): (e?: React.SyntheticEvent) => void {
  return useCallback(
    (e?: React.SyntheticEvent) => {
      const eventToTrack = typeof event === 'function' ? event(e!) : event;
      analytics.track(eventToTrack);
    },
    [event]
  );
}

/**
 * Track scroll depth on a page.
 * Fires events at 25%, 50%, 75%, and 100% scroll thresholds.
 *
 * Example:
 *   useScrollDepthTracking();
 */
export function useScrollDepthTracking(): void {
  const thresholds = useRef(new Set<number>([25, 50, 75, 100]));
  const tracked = useRef(new Set<number>());

  useEffect(() => {
    const handleScroll = () => {
      const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
      const scrolled = window.scrollY;
      const scrollPercent = Math.round((scrolled / scrollHeight) * 100);

      // Fire event for each threshold crossed
      thresholds.current.forEach((threshold) => {
        if (scrollPercent >= threshold && !tracked.current.has(threshold)) {
          analytics.track({
            name: 'scroll_depth',
            params: { depth_percentage: threshold },
          });
          tracked.current.add(threshold);
        }
      });
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);
}

/**
 * Track when a section becomes visible in the viewport (Intersection Observer).
 *
 * Example:
 *   const ref = useSectionVisibility('hero');
 *   <section ref={ref} id="hero">...</section>
 */
export function useSectionVisibility(sectionName: string): React.RefCallback<HTMLElement> {
  const tracked = useRef(false);

  return useCallback(
    (node: HTMLElement | null) => {
      if (!node || tracked.current) return;

      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting && !tracked.current) {
              analytics.track({
                name: 'section_visible',
                params: { section_name: sectionName },
              });
              tracked.current = true;
              observer.disconnect();
            }
          });
        },
        { threshold: 0.5 } // Section must be 50% visible
      );

      observer.observe(node);
    },
    [sectionName]
  );
}

/**
 * Track outbound links automatically.
 * Attach to a container (e.g., footer) and all external links will be tracked.
 *
 * Example:
 *   const ref = useOutboundLinkTracking();
 *   <footer ref={ref}>...</footer>
 */
export function useOutboundLinkTracking(): React.RefCallback<HTMLElement> {
  return useCallback((node: HTMLElement | null) => {
    if (!node) return;

    const handleClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest('a');
      if (!target) return;

      const href = target.getAttribute('href');
      if (!href) return;

      // Check if link is external (different origin)
      try {
        const url = new URL(href, window.location.origin);
        if (url.origin !== window.location.origin) {
          analytics.track({
            name: 'outbound_link',
            params: {
              link_url: href,
              link_domain: url.hostname,
            },
          });
        }
      } catch {
        // Invalid URL, ignore
      }
    };

    node.addEventListener('click', handleClick);
    return () => node.removeEventListener('click', handleClick);
  }, []);
}
