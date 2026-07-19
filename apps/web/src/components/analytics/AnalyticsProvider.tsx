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
import { loadConsent } from '@/lib/analytics/consent';
import { captureAttribution } from '@/lib/analytics/attribution';
import { initMonitoring } from '@/lib/monitoring';

export function AnalyticsProvider() {
  const router = useRouter();
  const initialized = useRef(false);

  // Initialize analytics + monitoring once on mount.
  useEffect(() => {
    if (!initialized.current) {
      // Snapshot marketing attribution before anything navigates away.
      captureAttribution();

      const config = getAnalyticsConfig();
      analytics.init(config);

      // Re-apply a stored consent decision so it survives reloads across the
      // whole app; the banner (on the marketing page) drives first-time choices.
      const stored = loadConsent();
      if (stored) analytics.setConsent(stored);

      // Global error handlers + Web Vitals.
      initMonitoring();

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
