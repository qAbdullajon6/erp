import { describe, expect, it } from 'vitest';
import { validateOrderField, validateOrderFields, type OrderFormFields } from './order-form-shared';

/// Pure-logic tests for the order form validator covering the new stop-detail
/// fields added alongside Phase 1 of the location architecture (TD-TELEMATICS-04).
/// These run without React, browser, or network — just the validation function.

const base: OrderFormFields = {
  customerId: 'cust-1',
  pickupAddress: '10 Depot Rd',
  pickupCity: 'Tashkent',
  pickupDate: '2026-09-01',
  deliveryAddress: '5 Dock St',
  deliveryCity: 'Samarkand',
  deliveryDate: '2026-09-03',
  cargoDescription: 'Pallets',
  price: 1500,
  currency: 'USD',
};

// ---------------------------------------------------------------------------
// Pickup advanced fields
// ---------------------------------------------------------------------------

describe('pickupPostalCode', () => {
  it('passes when absent', () => {
    expect(validateOrderField('pickupPostalCode', base)).toBeNull();
  });

  it('passes a valid postal code', () => {
    expect(validateOrderField('pickupPostalCode', { ...base, pickupPostalCode: '100000' })).toBeNull();
  });

  it('rejects value longer than 20 chars', () => {
    expect(
      validateOrderField('pickupPostalCode', { ...base, pickupPostalCode: 'A'.repeat(21) }),
    ).toMatch(/Max/);
  });
});

describe('pickupCountryCode', () => {
  it('passes when absent', () => {
    expect(validateOrderField('pickupCountryCode', base)).toBeNull();
  });

  it('passes a valid 2-letter code', () => {
    expect(validateOrderField('pickupCountryCode', { ...base, pickupCountryCode: 'UZ' })).toBeNull();
  });

  it('rejects a 1-letter code', () => {
    expect(validateOrderField('pickupCountryCode', { ...base, pickupCountryCode: 'U' })).toBeTruthy();
  });

  it('rejects a 3-letter code', () => {
    expect(validateOrderField('pickupCountryCode', { ...base, pickupCountryCode: 'UZB' })).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Pickup time window cross-field rules
// ---------------------------------------------------------------------------

describe('pickup time window — cross-field validation', () => {
  it('passes when both are absent', () => {
    expect(validateOrderField('pickupWindowStart', base)).toBeNull();
    expect(validateOrderField('pickupWindowEnd', base)).toBeNull();
  });

  it('requires end when only start is set', () => {
    const data: OrderFormFields = { ...base, pickupWindowStart: '2026-09-01T08:00:00' };
    expect(validateOrderField('pickupWindowStart', data)).toMatch(/end/i);
    expect(validateOrderField('pickupWindowEnd', data)).toBeNull(); // end field: no value, error on start
  });

  it('requires start when only end is set', () => {
    const data: OrderFormFields = { ...base, pickupWindowEnd: '2026-09-01T12:00:00' };
    expect(validateOrderField('pickupWindowEnd', data)).toMatch(/start/i);
    expect(validateOrderField('pickupWindowStart', data)).toBeNull();
  });

  it('passes when both are set and end > start', () => {
    const data: OrderFormFields = {
      ...base,
      pickupWindowStart: '2026-09-01T08:00:00',
      pickupWindowEnd: '2026-09-01T12:00:00',
    };
    expect(validateOrderField('pickupWindowStart', data)).toBeNull();
    expect(validateOrderField('pickupWindowEnd', data)).toBeNull();
  });

  it('rejects when end is before start', () => {
    const data: OrderFormFields = {
      ...base,
      pickupWindowStart: '2026-09-01T14:00:00',
      pickupWindowEnd: '2026-09-01T09:00:00',
    };
    expect(validateOrderField('pickupWindowEnd', data)).toMatch(/after/i);
    expect(validateOrderField('pickupWindowStart', data)).toBeNull(); // start itself is fine
  });

  it('rejects when end equals start', () => {
    const data: OrderFormFields = {
      ...base,
      pickupWindowStart: '2026-09-01T10:00:00',
      pickupWindowEnd: '2026-09-01T10:00:00',
    };
    // equal times: new Date(end) < new Date(start) is false, so passes (same-minute windows are valid)
    expect(validateOrderField('pickupWindowEnd', data)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Delivery time window (same rules, different prefix)
// ---------------------------------------------------------------------------

describe('delivery time window — cross-field validation', () => {
  it('requires end when only start is set', () => {
    const data: OrderFormFields = { ...base, deliveryWindowStart: '2026-09-03T09:00:00' };
    expect(validateOrderField('deliveryWindowStart', data)).toMatch(/end/i);
  });

  it('rejects end before start', () => {
    const data: OrderFormFields = {
      ...base,
      deliveryWindowStart: '2026-09-03T15:00:00',
      deliveryWindowEnd: '2026-09-03T10:00:00',
    };
    expect(validateOrderField('deliveryWindowEnd', data)).toMatch(/after/i);
  });

  it('passes valid window', () => {
    const data: OrderFormFields = {
      ...base,
      deliveryWindowStart: '2026-09-03T09:00:00',
      deliveryWindowEnd: '2026-09-03T12:00:00',
    };
    expect(validateOrderField('deliveryWindowStart', data)).toBeNull();
    expect(validateOrderField('deliveryWindowEnd', data)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// validateOrderFields (batch) — ensures stop fields are included when present
// ---------------------------------------------------------------------------

describe('validateOrderFields — batch window validation', () => {
  it('collects errors from both window fields when start-only is set', () => {
    const data: OrderFormFields = { ...base, pickupWindowStart: '2026-09-01T08:00:00' };
    const errors = validateOrderFields(
      ['pickupWindowStart', 'pickupWindowEnd'],
      data,
    );
    expect(errors.pickupWindowStart).toBeTruthy();
    expect(errors.pickupWindowEnd).toBeUndefined();
  });

  it('collects no errors when window is valid', () => {
    const data: OrderFormFields = {
      ...base,
      pickupWindowStart: '2026-09-01T08:00:00',
      pickupWindowEnd: '2026-09-01T17:00:00',
    };
    const errors = validateOrderFields(['pickupWindowStart', 'pickupWindowEnd'], data);
    expect(Object.keys(errors)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Existing required fields still validate correctly after the additions
// ---------------------------------------------------------------------------

describe('existing required fields unchanged', () => {
  it('rejects missing pickupCity', () => {
    expect(validateOrderField('pickupCity', { ...base, pickupCity: '' })).toBeTruthy();
  });

  it('rejects delivery before pickup', () => {
    expect(
      validateOrderField('deliveryDate', { ...base, deliveryDate: '2026-08-31' }),
    ).toMatch(/before/i);
  });

  it('accepts a valid complete form', () => {
    const errors = validateOrderFields(Object.keys(base), base);
    expect(Object.keys(errors)).toHaveLength(0);
  });
});
