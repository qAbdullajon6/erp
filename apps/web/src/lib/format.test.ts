import { describe, it, expect } from 'vitest';
import {
  formatStopTime,
  formatRemainingDistance,
  formatEtaMinutes,
  formatDeliveryWindow,
} from './format';

describe('formatStopTime', () => {
  it('extracts HH:MM from a full ISO datetime with Z suffix', () => {
    expect(formatStopTime('2026-09-01T09:00:00.000Z')).toBe('09:00');
  });

  it('extracts HH:MM from ISO datetime stored without timezone suffix', () => {
    expect(formatStopTime('2026-09-01T14:30:00')).toBe('14:30');
  });

  it('handles midnight', () => {
    expect(formatStopTime('2026-09-01T00:00:00')).toBe('00:00');
  });

  it('handles end of day', () => {
    expect(formatStopTime('2026-09-01T23:59:00')).toBe('23:59');
  });

  it('matches the window start stored by order-form-shared combineDateTime convention', () => {
    // combineDateTime produces "2026-09-01T09:30:00" (no tz suffix)
    expect(formatStopTime('2026-09-01T09:30:00')).toBe('09:30');
  });
});

describe('formatRemainingDistance', () => {
  it('shows one decimal place for sub-10 km distances', () => {
    expect(formatRemainingDistance(3.2)).toBe('3.2 km');
  });

  it('shows one decimal place for sub-1 km distances', () => {
    expect(formatRemainingDistance(0.8)).toBe('0.8 km');
  });

  it('rounds to nearest km for 10 km and above', () => {
    expect(formatRemainingDistance(12)).toBe('12 km');
  });

  it('rounds up correctly for 10+ km', () => {
    expect(formatRemainingDistance(12.6)).toBe('13 km');
  });

  it('handles zero', () => {
    expect(formatRemainingDistance(0)).toBe('0.0 km');
  });

  it('shows correct decimal for 9.5 km (sub-10)', () => {
    expect(formatRemainingDistance(9.5)).toBe('9.5 km');
  });
});

describe('formatEtaMinutes', () => {
  it('formats single-digit minutes', () => {
    expect(formatEtaMinutes(8)).toBe('ETA 8 min');
  });

  it('formats double-digit minutes', () => {
    expect(formatEtaMinutes(42)).toBe('ETA 42 min');
  });

  it('handles zero minutes', () => {
    expect(formatEtaMinutes(0)).toBe('ETA 0 min');
  });
});

describe('formatDeliveryWindow', () => {
  it('formats a standard delivery window from ISO datetimes', () => {
    expect(formatDeliveryWindow('2026-09-01T13:00:00', '2026-09-01T16:00:00'))
      .toBe('Expected between 13:00 – 16:00');
  });

  it('handles a window crossing midnight', () => {
    expect(formatDeliveryWindow('2026-09-01T22:00:00', '2026-09-02T02:00:00'))
      .toBe('Expected between 22:00 – 02:00');
  });

  it('uses the same no-timezone-conversion convention as formatStopTime', () => {
    // Both times are extracted with slice(11,16), so UTC suffix does not shift them
    expect(formatDeliveryWindow('2026-09-01T09:00:00.000Z', '2026-09-01T17:00:00.000Z'))
      .toBe('Expected between 09:00 – 17:00');
  });
});
