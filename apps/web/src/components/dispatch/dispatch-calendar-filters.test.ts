import { describe, expect, it } from 'vitest';
import {
  applyDatePreset,
  countActiveFilters,
  parseCalendarStatus,
  parseOptionalId,
} from './dispatch-calendar-filters';

describe('dispatch-calendar-filters', () => {
  it('parses status aliases', () => {
    expect(parseCalendarStatus('assigned')).toBe('ASSIGNED');
    expect(parseCalendarStatus('EN_ROUTE_TO_PICKUP')).toBe('EN_ROUTE_TO_PICKUP');
    expect(parseCalendarStatus('nope')).toBeUndefined();
  });

  it('parses uuids only', () => {
    expect(parseOptionalId('b07da295-786f-40d9-94a9-9046f5ff4dd9')).toBe(
      'b07da295-786f-40d9-94a9-9046f5ff4dd9',
    );
    expect(parseOptionalId('Shohruh')).toBeUndefined();
  });

  it('counts active filters', () => {
    expect(
      countActiveFilters({
        driverId: 'x',
        status: 'ASSIGNED',
        preset: 'today',
        q: 'DSP',
      }),
    ).toBe(4);
  });

  it('applies today/week presets', () => {
    const today = applyDatePreset('today', new Date('2026-07-29T12:00:00'));
    expect(today.view).toBe('day');
    const week = applyDatePreset('week', new Date('2026-07-29T12:00:00'));
    expect(week.view).toBe('week');
  });
});
