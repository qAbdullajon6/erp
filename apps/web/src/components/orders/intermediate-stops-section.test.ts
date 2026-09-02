import { describe, it, expect } from 'vitest';
import { validateStopField, validateStopFields, type StopFormValues } from './order-form-shared';
import { EMPTY_STOP, STOP_FIELDS, validateStop } from './intermediate-stops-section';

// ---------------------------------------------------------------------------
// validateStopField
// ---------------------------------------------------------------------------

describe('validateStopField — address', () => {
  it('returns error when address is empty', () => {
    expect(validateStopField('address', { address: '' })).toBeTruthy();
  });
  it('returns error when address is whitespace', () => {
    expect(validateStopField('address', { address: '   ' })).toBeTruthy();
  });
  it('returns null for a valid address', () => {
    expect(validateStopField('address', { address: '1 Test St' })).toBeNull();
  });
  it('returns error when address exceeds 300 chars', () => {
    expect(validateStopField('address', { address: 'a'.repeat(301) })).toBeTruthy();
  });
});

describe('validateStopField — city', () => {
  it('returns error when city is empty', () => {
    expect(validateStopField('city', { city: '' })).toBeTruthy();
  });
  it('returns null for a valid city', () => {
    expect(validateStopField('city', { city: 'Tashkent' })).toBeNull();
  });
  it('returns error when city exceeds 100 chars', () => {
    expect(validateStopField('city', { city: 'x'.repeat(101) })).toBeTruthy();
  });
});

describe('validateStopField — countryCode', () => {
  it('returns null when countryCode is absent', () => {
    expect(validateStopField('countryCode', {})).toBeNull();
  });
  it('returns null for a valid 2-letter code', () => {
    expect(validateStopField('countryCode', { countryCode: 'UZ' })).toBeNull();
  });
  it('returns error for a 1-letter code', () => {
    expect(validateStopField('countryCode', { countryCode: 'U' })).toBeTruthy();
  });
  it('returns error for a 3-letter code', () => {
    expect(validateStopField('countryCode', { countryCode: 'UZB' })).toBeTruthy();
  });
});

describe('validateStopField — window pairs', () => {
  it('returns null when both window fields are absent', () => {
    expect(validateStopField('windowStart', {})).toBeNull();
    expect(validateStopField('windowEnd', {})).toBeNull();
  });
  it('returns error on windowStart when only windowStart is set', () => {
    const stop: StopFormValues = { windowStart: '2041-06-02T09:00:00.000Z' };
    expect(validateStopField('windowStart', stop)).toBeTruthy();
  });
  it('returns error on windowEnd when only windowEnd is set', () => {
    const stop: StopFormValues = { windowEnd: '2041-06-02T12:00:00.000Z' };
    expect(validateStopField('windowEnd', stop)).toBeTruthy();
  });
  it('returns error when windowEnd is before windowStart', () => {
    const stop: StopFormValues = {
      windowStart: '2041-06-02T12:00:00.000Z',
      windowEnd: '2041-06-02T09:00:00.000Z',
    };
    expect(validateStopField('windowEnd', stop)).toBeTruthy();
  });
  it('returns null when both window fields are valid', () => {
    const stop: StopFormValues = {
      windowStart: '2041-06-02T09:00:00.000Z',
      windowEnd: '2041-06-02T12:00:00.000Z',
    };
    expect(validateStopField('windowStart', stop)).toBeNull();
    expect(validateStopField('windowEnd', stop)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// validateStop (validates all STOP_FIELDS at once)
// ---------------------------------------------------------------------------

describe('validateStop — full stop validation', () => {
  it('returns errors for address and city when they are empty', () => {
    const errs = validateStop({ address: '', city: '' }, STOP_FIELDS);
    expect(errs.address).toBeTruthy();
    expect(errs.city).toBeTruthy();
  });
  it('returns empty errors for a minimal valid stop', () => {
    const errs = validateStop({ address: '1 Test St', city: 'Tashkent' }, STOP_FIELDS);
    expect(Object.keys(errs)).toHaveLength(0);
  });
  it('returns errors for invalid optional fields alongside required ones', () => {
    const errs = validateStop(
      { address: '1 Test St', city: 'Tashkent', countryCode: 'UZB' },
      STOP_FIELDS,
    );
    expect(errs.countryCode).toBeTruthy();
    expect(errs.address).toBeUndefined();
    expect(errs.city).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// validateStopFields (shared helper)
// ---------------------------------------------------------------------------

describe('validateStopFields', () => {
  it('validates only the fields listed', () => {
    const stop: StopFormValues = { address: '', city: '' };
    const errs = validateStopFields(['address'], stop);
    expect(errs.address).toBeTruthy();
    expect(errs.city).toBeUndefined();
  });
  it('returns empty object when all fields pass', () => {
    const stop: StopFormValues = { address: '1 Test', city: 'Tashkent' };
    const errs = validateStopFields(['address', 'city'], stop);
    expect(Object.keys(errs)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// EMPTY_STOP shape
// ---------------------------------------------------------------------------

describe('EMPTY_STOP', () => {
  it('has an empty address and city', () => {
    expect(EMPTY_STOP.address).toBe('');
    expect(EMPTY_STOP.city).toBe('');
  });
  it('fails validation because address and city are required', () => {
    const errs = validateStop(EMPTY_STOP, STOP_FIELDS);
    expect(errs.address).toBeTruthy();
    expect(errs.city).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// move helpers (pure array logic tested directly)
// ---------------------------------------------------------------------------

describe('stop reordering logic', () => {
  function moveStop(arr: string[], index: number, direction: -1 | 1): string[] {
    const next = [...arr];
    const target = index + direction;
    if (target < 0 || target >= next.length) return next;
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  }

  it('moves a stop up (direction -1)', () => {
    expect(moveStop(['A', 'B', 'C'], 1, -1)).toEqual(['B', 'A', 'C']);
  });
  it('moves a stop down (direction +1)', () => {
    expect(moveStop(['A', 'B', 'C'], 1, 1)).toEqual(['A', 'C', 'B']);
  });
  it('does not move the first stop up', () => {
    expect(moveStop(['A', 'B', 'C'], 0, -1)).toEqual(['A', 'B', 'C']);
  });
  it('does not move the last stop down', () => {
    expect(moveStop(['A', 'B', 'C'], 2, 1)).toEqual(['A', 'B', 'C']);
  });
  it('handles a single-element array', () => {
    expect(moveStop(['A'], 0, -1)).toEqual(['A']);
    expect(moveStop(['A'], 0, 1)).toEqual(['A']);
  });
});

// ---------------------------------------------------------------------------
// stopIndex normalization (from array position)
// ---------------------------------------------------------------------------

describe('stopIndex normalization', () => {
  it('assigns stopIndex from array position (1-based)', () => {
    const stops = [
      { address: 'A St', city: 'CityA' },
      { address: 'B St', city: 'CityB' },
      { address: 'C St', city: 'CityC' },
    ];
    const indexed = stops.map((s, i) => ({ ...s, stopIndex: i + 1 }));
    expect(indexed.map((s) => s.stopIndex)).toEqual([1, 2, 3]);
  });
});
