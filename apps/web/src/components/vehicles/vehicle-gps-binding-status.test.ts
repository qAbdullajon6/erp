import { describe, expect, it } from 'vitest';
import { gpsBindingConnectionPresentation } from './vehicle-gps-binding-status';

const NOW = Date.parse('2026-08-12T12:00:00.000Z');

describe('gpsBindingConnectionPresentation', () => {
  const device = {
    active: true,
    archivedAt: null,
    lastSeenAt: null,
  };

  it('uses the backend stale calculation for online and offline status', () => {
    expect(
      gpsBindingConnectionPresentation(
        device,
        { isStale: false, lastReceivedAt: '2026-08-12T11:59:30.000Z' },
        NOW,
      ).label,
    ).toBe('Online');

    expect(
      gpsBindingConnectionPresentation(
        device,
        { isStale: true, lastReceivedAt: '2026-08-12T10:00:00.000Z' },
        NOW,
      ).label,
    ).toBe('Offline / stale');
  });

  it('shows a recent device check-in while the first map position is pending', () => {
    expect(
      gpsBindingConnectionPresentation(
        { ...device, lastSeenAt: '2026-08-12T11:55:00.000Z' },
        null,
        NOW,
      ).label,
    ).toBe('Device online');
  });

  it('does not present inactive or archived devices as online', () => {
    expect(
      gpsBindingConnectionPresentation({ ...device, active: false }, null, NOW).label,
    ).toBe('Device inactive');
    expect(
      gpsBindingConnectionPresentation(
        { ...device, archivedAt: '2026-08-12T11:00:00.000Z' },
        { isStale: false, lastReceivedAt: '2026-08-12T11:59:30.000Z' },
        NOW,
      ).label,
    ).toBe('Device archived');
  });
});
