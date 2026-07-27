import { describe, expect, it } from 'vitest';
import {
  formatRadiusM,
  geofenceEventLabel,
  geofenceLifecycle,
  hasRenderableGeometry,
} from './geofences-ops';
import type { Geofence } from '@/lib/api/telematics-geofences';

function fence(partial: Partial<Geofence>): Geofence {
  return {
    id: 'g1',
    organizationId: 'o1',
    name: 'Depot',
    type: 'CIRCLE',
    active: true,
    centerLat: 41.3,
    centerLng: 69.2,
    radiusM: 250,
    polygon: null,
    color: null,
    category: null,
    linkedCustomerId: null,
    alertOnEnter: false,
    alertOnExit: false,
    dwellThresholdSec: null,
    archivedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

describe('geofences-ops', () => {
  it('classifies lifecycle', () => {
    expect(geofenceLifecycle(fence({}))).toBe('active');
    expect(geofenceLifecycle(fence({ active: false }))).toBe('inactive');
    expect(
      geofenceLifecycle(fence({ archivedAt: '2026-01-02T00:00:00.000Z' })),
    ).toBe('archived');
  });

  it('labels event types', () => {
    expect(geofenceEventLabel('ENTER')).toBe('Entered');
    expect(geofenceEventLabel('EXIT')).toBe('Exited');
    expect(geofenceEventLabel('DWELL')).toBe('Dwell');
  });

  it('detects renderable geometry', () => {
    expect(hasRenderableGeometry(fence({}))).toBe(true);
    expect(hasRenderableGeometry(fence({ radiusM: null }))).toBe(false);
    expect(
      hasRenderableGeometry(
        fence({
          type: 'POLYGON',
          centerLat: null,
          centerLng: null,
          radiusM: null,
          polygon: [
            { lat: 1, lng: 1 },
            { lat: 1, lng: 2 },
            { lat: 2, lng: 2 },
          ],
        }),
      ),
    ).toBe(true);
  });

  it('formats radius', () => {
    expect(formatRadiusM(null)).toBe('—');
    expect(formatRadiusM(250)).toBe('250 m');
    expect(formatRadiusM(1500)).toBe('1.5 km');
  });
});
