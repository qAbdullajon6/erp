/**
 * Analytics Provider component.
 *
 * Initializes the analytics service once at app startup.
 * Also handles route changes and tracks page views automatically.
 */

import { useEffect, useRef } from 'react';
import { useRouter } from '@tanstack/react-router';
import { analytics } from '@/lib/analytics';
import { getAnalyticsConfig } from '@/lib/analytics/config';

export function AnalyticsProvider() {
  const router = useRouter();
  const initialized = useRef(false);

  // Initialize analytics on mount
  useEffect(() => {
    if (!initialized.current) {
      const config = getAnalyticsConfig();
      analytics.init(config);
      initialized.current = true;
    }
  }, []);

  // Track page views on route changes
  useEffect(() => {
    const unsubscribe = router.subscribe('onResolved', ({ toLocation }) => {
      const title = (toLocation.state as { title?: string } | undefined)?.title;
      analytics.pageView(toLocation.pathname, title);
    });

    return unsubscribe;
  }, [router]);

  return null; // This component doesn't render anything
}
