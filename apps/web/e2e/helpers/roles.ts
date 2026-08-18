import { DEFAULT_PASSWORD } from './env';

export type StaffRole =
  | 'ADMIN'
  | 'OPERATIONS_MANAGER'
  | 'DISPATCHER'
  | 'ACCOUNTANT'
  | 'SALES_CRM_MANAGER'
  | 'DRIVER';

export const ROLE_EMAILS: Record<StaffRole, string> = {
  ADMIN: 'admin@flowerp.test',
  OPERATIONS_MANAGER: 'ops-manager@flowerp.test',
  DISPATCHER: 'dispatcher@flowerp.test',
  ACCOUNTANT: 'accountant@flowerp.test',
  SALES_CRM_MANAGER: 'sales@flowerp.test',
  DRIVER: 'driver@flowerp.test',
};

export const PORTAL_DEMO_EMAIL = 'contact-e-0001@portal.flowerp.test';

export function passwordFor(_role?: StaffRole | 'PORTAL'): string {
  return DEFAULT_PASSWORD;
}
