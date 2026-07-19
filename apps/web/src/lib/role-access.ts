import type { MembershipRole } from "@/lib/api/organizations";

/// Single source of truth for ProtectedApiRoute's `requireRoles`, mirrored
/// from each backend controller's own read-role list — see routes/app.tsx's
/// NavItem cross-reference table, which these are copied from. Kept
/// separate from that table (rather than importing NavItem's data) since
/// NavItem also carries icons/labels/paths that have nothing to do with
/// access control.

/// OrdersController.READ_ROLES / CustomersController.READ_ROLES /
/// FinanceController.ROLES / ReportsController.ROLES — every non-DRIVER role.
export const ALL_STAFF_ROLES: MembershipRole[] = [
  "ADMIN",
  "OPERATIONS_MANAGER",
  "DISPATCHER",
  "ACCOUNTANT",
  "SALES_CRM_MANAGER",
];

/// DispatchesController.ROLES_READ — every non-DRIVER role except SALES_CRM_MANAGER.
export const DISPATCH_ROLES: MembershipRole[] = ["ADMIN", "OPERATIONS_MANAGER", "DISPATCHER", "ACCOUNTANT"];

/// DriversController.ROLES / VehiclesController.ROLES.
export const FLEET_ROLES: MembershipRole[] = ["ADMIN", "OPERATIONS_MANAGER", "DISPATCHER"];

/// AuditController.ROLES_READ.
export const AUDIT_ROLES: MembershipRole[] = ["ADMIN", "OPERATIONS_MANAGER", "ACCOUNTANT"];

/// ImportController's role set.
export const IMPORT_ROLES: MembershipRole[] = ["ADMIN", "OPERATIONS_MANAGER", "DISPATCHER"];

/// WorkflowController.WORKFLOW_ROLES / developer-portal admin controllers.
export const ADMIN_OPS_ROLES: MembershipRole[] = ["ADMIN", "OPERATIONS_MANAGER"];

/// SubscriptionsController (@Roles("ADMIN")) and PlansController's admin routes —
/// billing management is ADMIN-only, so OPERATIONS_MANAGER is deliberately
/// excluded here (the API 403s them).
export const ADMIN_ONLY_ROLES: MembershipRole[] = ["ADMIN"];

/// OrdersController.CREATE_UPDATE_ROLES — excludes ACCOUNTANT (read-only orders).
export const ORDER_WRITE_ROLES: MembershipRole[] = [
  "ADMIN",
  "OPERATIONS_MANAGER",
  "DISPATCHER",
  "SALES_CRM_MANAGER",
];

/// OrdersController.OPERATIONAL_ROLES — assign/status/cancel. Narrower than
/// ORDER_WRITE_ROLES: excludes SALES_CRM_MANAGER, who may edit an order's own
/// fields but not touch fulfillment-pipeline actions (ADR-001).
export const ORDER_OPERATIONAL_ROLES: MembershipRole[] = ["ADMIN", "OPERATIONS_MANAGER", "DISPATCHER"];

/// CustomersController.WRITE_ROLES.
export const CUSTOMER_WRITE_ROLES: MembershipRole[] = ["ADMIN", "SALES_CRM_MANAGER"];

/// InvoicesController.WRITE_ROLES (create/edit) vs FINALIZE_ROLES (send/cancel/record-payment).
export const INVOICE_WRITE_ROLES: MembershipRole[] = [
  "ADMIN",
  "ACCOUNTANT",
  "OPERATIONS_MANAGER",
  "SALES_CRM_MANAGER",
];
export const INVOICE_FINALIZE_ROLES: MembershipRole[] = ["ADMIN", "ACCOUNTANT"];

/// ExpensesController.WRITE_ROLES (create/edit) vs APPROVE_ROLES (approve/reject).
export const EXPENSE_WRITE_ROLES: MembershipRole[] = ["ADMIN", "ACCOUNTANT", "OPERATIONS_MANAGER"];
export const EXPENSE_APPROVE_ROLES: MembershipRole[] = ["ADMIN", "ACCOUNTANT"];

/// ExpensesController/InvoicesController READ_ROLES — narrower than
/// ALL_STAFF_ROLES: neither exposes its raw list to DISPATCHER, unlike the
/// finance summary aggregate. Used to gate the Finance page's tabs (the page
/// itself is opened under ALL_STAFF_ROLES for the Dashboard tab's sake).
export const INVOICE_READ_ROLES: MembershipRole[] = [
  "ADMIN",
  "ACCOUNTANT",
  "OPERATIONS_MANAGER",
  "SALES_CRM_MANAGER",
];
export const EXPENSE_READ_ROLES: MembershipRole[] = ["ADMIN", "ACCOUNTANT", "OPERATIONS_MANAGER"];
