import { describe, expect, it } from 'vitest';
import {
  deviceCommStatus,
  isTelematicsProvider,
  maskedSecretHint,
  summarizeProviderDevices,
} from './providers-ops';
import type { TelematicsDevice } from '@/lib/api/telematics-devices';

function device(partial: Partial<TelematicsDevice>): TelematicsDevice {
  return {
    id: 'd1',
    organizationId: 'o1',
    name: 'Unit',
    provider: 'TRACCAR',
    externalId: 'ext-1',
    vehicleId: null,
    active: true,
    lastSeenAt: null,
    hasIngestSecret: true,
    archivedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

describe('providers-ops', () => {
  it('derives communication status from backend fields only', () => {
    expect(deviceCommStatus(device({}))).toBe('waiting');
    expect(
      deviceCommStatus(device({ lastSeenAt: '2026-01-02T00:00:00.000Z' }), {
        now: new Date('2026-01-02T00:05:00.000Z').getTime(),
      }),
    ).toBe('connected');
    expect(
      deviceCommStatus(device({ lastSeenAt: '2026-01-02T00:00:00.000Z' }), {
        now: new Date('2026-01-02T00:15:00.000Z').getTime(),
      }),
    ).toBe('stale');
    expect(deviceCommStatus(device({ active: false }))).toBe('disconnected');
    expect(
      deviceCommStatus(device({ archivedAt: '2026-01-03T00:00:00.000Z' })),
    ).toBe('archived');
  });

  it('validates provider enum', () => {
    expect(isTelematicsProvider('TRACCAR')).toBe(true);
    expect(isTelematicsProvider('FOO')).toBe(false);
  });

  it('summarizes devices honestly when truncated', () => {
    const summary = summarizeProviderDevices(
      'SAMSARA',
      [
        device({
          id: 'a',
          vehicleId: 'v1',
          lastSeenAt: '2026-01-01T10:00:00.000Z',
        }),
        device({
          id: 'b',
          active: false,
          lastSeenAt: '2026-01-02T10:00:00.000Z',
        }),
      ],
      40,
    );
    expect(summary.total).toBe(40);
    expect(summary.assigned).toBe(1);
    expect(summary.aggregatesPartial).toBe(true);
    expect(summary.lastSeenAt).toBe('2026-01-02T10:00:00.000Z');
  });

  it('masks secrets without inventing prefixes', () => {
    expect(maskedSecretHint(false)).toBe('Not set');
    expect(maskedSecretHint(true)).toContain('hash only');
  });
});
