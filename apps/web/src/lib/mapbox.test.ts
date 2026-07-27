import { describe, expect, it } from 'vitest';
import {
  isMapboxPublicTokenConfigured,
  mapboxStyleUrl,
  mapboxTokenErrorMessage,
} from '@/lib/mapbox';

describe('mapbox helpers', () => {
  it('builds light and dark style URLs', () => {
    expect(mapboxStyleUrl('streets')).toContain('streets-v12');
    expect(mapboxStyleUrl('dark')).toContain('dark-v11');
    expect(mapboxStyleUrl('satellite')).toContain('satellite');
    expect(mapboxStyleUrl('navigation')).toContain('navigation');
  });

  it('reports token configuration honestly', () => {
    // Token comes from Vite env at build time — in unit tests it is typically empty.
    if (!isMapboxPublicTokenConfigured()) {
      expect(mapboxTokenErrorMessage().toLowerCase()).toContain('vite_mapbox');
    }
  });
});
