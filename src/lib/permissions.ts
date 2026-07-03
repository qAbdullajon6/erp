import type { OrderStatus } from "@/lib/types";
import type { Role } from "@/lib/role";

// Central capability model for demo role-based permission previews. This is
// NOT real authorization — it only controls what the UI shows/hides per role
// so the demo can illustrate role-based access without a real auth backend.
export type Capability =
  | "view_order_financials"
  | "edit_order_status"
  | "assign_orders"
  | "approve_expenses"
  | "record_payments"
  | "manage_finance_config"
  | "manage_customers"
  | "create_order";

const ALL_CAPABILITIES: Capability[] = [
  "view_order_financials",
  "edit_order_status",
  "assign_orders",
  "approve_expenses",
  "record_payments",
  "manage_finance_config",
  "manage_customers",
  "create_order",
];

export const rolePermissions: Record<Role, Capability[]> = {
  admin: ALL_CAPABILITIES,
  ops_manager: ["view_order_financials", "edit_order_status", "assign_orders", "manage_customers", "create_order"],
  dispatcher: ["edit_order_status", "assign_orders", "create_order"],
  accountant: ["view_order_financials", "approve_expenses", "record_payments", "manage_finance_config"],
  driver: [],
  sales: ["manage_customers", "create_order"],
};

export function hasCapability(role: Role, capability: Capability): boolean {
  return rolePermissions[role].includes(capability);
}

export type ReportTab = "executive" | "operations" | "financial";

/** Which Reports tabs a role may see. Accountant is restricted to the financial tab per spec. */
export function visibleReportTabs(role: Role): ReportTab[] {
  if (role === "accountant") return ["financial"];
  return ["executive", "operations", "financial"];
}

export type AiPromptCategory = "operations" | "finance" | "fleet" | "customers" | "reports";

/** Which suggested-prompt categories a role sees in the AI Assistant. The underlying
 *  engine still answers any question asked — this only scopes the suggestion chips. */
export function visibleAiPromptCategories(role: Role): AiPromptCategory[] {
  if (role === "accountant") return ["finance"];
  if (role === "sales") return ["customers"];
  return ["operations", "finance", "fleet", "customers", "reports"];
}

const DRIVER_STATUS_TRANSITIONS: Partial<Record<OrderStatus, OrderStatus>> = {
  assigned: "picked_up",
  picked_up: "in_transit",
  in_transit: "delivered",
};

/** The single next status a Driver may set on their own delivery — a linear
 *  subset of the full transition graph in status-meta.ts, with no cancel option. */
export function getDriverNextStatus(status: OrderStatus): OrderStatus | null {
  return DRIVER_STATUS_TRANSITIONS[status] ?? null;
}
