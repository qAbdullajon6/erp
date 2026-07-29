/** Deterministic enterprise-scale seed constants. */

export const ENTERPRISE_SEED_VERSION = 1;
export const ENTERPRISE_SEED_TAG = 'enterprise-seed-v1';

/** Fixed PRNG seed — changing this changes every generated row. */
export const ENTERPRISE_RNG_SEED = 0x464c4f57; // "FLOW"

export const COUNTS = {
  customers: 100,
  orders: 500,
  dispatches: 300,
  drivers: 80,
  vehicles: 120,
  invoices: 300,
  payments: 200,
  notifications: 1000,
  auditLogs: 500,
  conflicts: 100,
  documents: 150,
  pods: 80,
  portalAccounts: 8,
} as const;

export const TEST_ORG_SLUG = 'flowerp-test-logistics';
export const TEST_PASSWORD = 'FlowERP-Test-2026!';

/** Code prefixes so --force can wipe only enterprise rows. */
export const PREFIX = {
  customer: 'CUS-E-',
  driver: 'EMP-E-',
  vehicle: 'VEH-E-',
  order: 'ORD-E-',
  dispatch: 'DSP-E-',
  invoice: 'INV-E-',
  portalEmailDomain: 'portal.flowerp.test',
} as const;
