// Local deterministic intent engine for the AI Operations Assistant. There is
// no external AI API in this phase — every answer is computed from the live
// ERP store using the same helpers that power Dashboard/Reports/Notifications,
// so numbers always agree across the app. The architecture (typed intents +
// typed AssistantResponse) is designed so a real LLM/API could later replace
// `askAssistant` without touching the chat UI.

import {
  formatCurrency,
  formatDate,
  getCustomer,
  getCustomerLifetimeValue,
  getCustomerOutstandingBalance,
  getCustomerOverdueBalance,
  getDriverDelayCount,
  getInvoiceOverdueDays,
  getInvoiceRemaining,
  getInvoiceStatus,
  getOrderProfit,
  getReferenceNow,
  getRouteProfitability,
  getVehicleExpenseTotal,
  isDeliveryDueSoon,
  isLicenseExpiringSoon,
  isMaintenanceDueSoon,
  isOrderDelayed,
} from "@/lib/mock-data";
import {
  computeExecutiveStats,
  defaultReportFilters,
  getOrderExceptions,
  getReceivablesAging,
} from "@/lib/reports-data";
import {
  getPreviousPeriodBounds,
  isWithinRange,
  percentChange,
  resolveDateRange,
  type DateRangeOption,
} from "@/lib/date-range";
import { getNotifications } from "@/lib/notifications";
import { notificationPriorityMeta } from "@/lib/status-meta";
import type { NotificationThresholds } from "@/lib/notification-settings";
import type { Customer, Driver, Expense, Invoice, Order, Vehicle } from "@/lib/types";

export type IntentCategory = "operations" | "finance" | "fleet" | "customers" | "reports";

export interface AssistantMetric {
  label: string;
  value: string;
  tone?: "positive" | "negative" | "neutral";
}

export interface AssistantTableColumn {
  key: string;
  label: string;
}

export interface AssistantTable {
  columns: AssistantTableColumn[];
  rows: Record<string, string>[];
}

export interface AssistantLink {
  label: string;
  href: string;
}

export interface AssistantRecommendation {
  label: string;
  href: string;
  priority: "critical" | "high" | "medium" | "low";
}

export interface AssistantResponse {
  category: IntentCategory;
  answer: string;
  metrics?: AssistantMetric[];
  table?: AssistantTable;
  emptyNote?: string;
  explanation?: string;
  links?: AssistantLink[];
  recommendations?: AssistantRecommendation[];
}

export interface AssistantData {
  orders: Order[];
  drivers: Driver[];
  vehicles: Vehicle[];
  invoices: Invoice[];
  expenses: Expense[];
  customers: Customer[];
  notificationThresholds: NotificationThresholds;
}

interface Intent {
  id: string;
  category: IntentCategory;
  match: (question: string) => boolean;
  handle: (data: AssistantData, question: string) => AssistantResponse;
}

function matches(...patterns: RegExp[]) {
  return (question: string) => patterns.every((p) => p.test(question));
}

function execStatsFor(data: AssistantData, option: DateRangeOption) {
  const bounds = resolveDateRange(option, getReferenceNow());
  return { bounds, stats: computeExecutiveStats(data, defaultReportFilters, bounds) };
}

const intents: Intent[] = [
  {
    id: "fleet-driver-delay-count",
    category: "fleet",
    match: matches(/driver/i, /delay/i),
    handle: ({ drivers, orders }) => {
      const ranked = drivers
        .map((d) => ({ driver: d, delays: getDriverDelayCount(d.id, orders) }))
        .filter((r) => r.delays > 0)
        .sort((a, b) => b.delays - a.delays)
        .slice(0, 5);
      return {
        category: "fleet",
        answer:
          ranked.length === 0
            ? "No driver currently has any late deliveries."
            : `${ranked[0].driver.name} has the most delayed deliveries (${ranked[0].delays}).`,
        table:
          ranked.length > 0
            ? {
                columns: [
                  { key: "driver", label: "Driver" },
                  { key: "delays", label: "Late deliveries" },
                ],
                rows: ranked.map((r) => ({ driver: r.driver.name, delays: String(r.delays) })),
              }
            : undefined,
        emptyNote: ranked.length === 0 ? "All drivers are delivering on time." : undefined,
        explanation:
          "A delivery counts as late when it was delivered after its scheduled date, or is currently overdue.",
        links: [{ label: "View Drivers & Vehicles", href: "/drivers" }],
      };
    },
  },
  {
    id: "ops-delayed-today",
    category: "operations",
    match: matches(/delay|late|kechik/i),
    handle: ({ orders, customers }) => {
      const delayed = orders.filter(isOrderDelayed);
      return {
        category: "operations",
        answer:
          delayed.length === 0
            ? "No deliveries are currently delayed."
            : `${delayed.length} deliver${delayed.length === 1 ? "y is" : "ies are"} currently delayed.`,
        metrics: [
          {
            label: "Delayed deliveries",
            value: String(delayed.length),
            tone: delayed.length > 0 ? "negative" : "positive",
          },
        ],
        table:
          delayed.length > 0
            ? {
                columns: [
                  { key: "id", label: "Order" },
                  { key: "customer", label: "Customer" },
                  { key: "due", label: "Was due" },
                ],
                rows: delayed.slice(0, 10).map((o) => ({
                  id: o.id,
                  customer: getCustomer(o.customerId, customers)?.name ?? "Unknown",
                  due: formatDate(o.deliveryDate),
                })),
              }
            : undefined,
        emptyNote: delayed.length === 0 ? "Everything is on schedule." : undefined,
        explanation:
          "An order is delayed when its delivery date has passed but it hasn't reached Delivered or Cancelled status.",
        links: [{ label: "View Orders", href: "/orders" }],
        recommendations: delayed.slice(0, 3).map((o) => ({
          label: `Check on ${o.id} (${getCustomer(o.customerId, customers)?.name ?? "customer"})`,
          href: "/orders",
          priority: "critical",
        })),
      };
    },
  },
  {
    id: "ops-due-soon",
    category: "operations",
    match: matches(/due/i, /hour/i),
    handle: ({ orders, customers, notificationThresholds }) => {
      const hours = notificationThresholds.deliveryDueSoonHours;
      const dueSoon = orders.filter((o) => isDeliveryDueSoon(o, hours));
      return {
        category: "operations",
        answer:
          dueSoon.length === 0
            ? `No deliveries are due within the next ${hours} hours.`
            : `${dueSoon.length} deliver${dueSoon.length === 1 ? "y is" : "ies are"} due within the next ${hours} hours.`,
        table:
          dueSoon.length > 0
            ? {
                columns: [
                  { key: "id", label: "Order" },
                  { key: "customer", label: "Customer" },
                  { key: "due", label: "Due" },
                ],
                rows: dueSoon.map((o) => ({
                  id: o.id,
                  customer: getCustomer(o.customerId, customers)?.name ?? "Unknown",
                  due: formatDate(o.deliveryDate),
                })),
              }
            : undefined,
        emptyNote: dueSoon.length === 0 ? "Nothing urgent in the next window." : undefined,
        explanation: `Uses your configured "delivery due soon" threshold of ${hours} hours from Notification Settings.`,
        links: [{ label: "View Orders", href: "/orders" }],
      };
    },
  },
  {
    id: "ops-unassigned",
    category: "operations",
    match: matches(/unassign/i),
    handle: ({ orders, customers }) => {
      const unassigned = orders.filter((o) => o.status === "pending" && !o.driverId);
      return {
        category: "operations",
        answer:
          unassigned.length === 0
            ? "No orders are unassigned right now."
            : `${unassigned.length} order${unassigned.length === 1 ? "" : "s"} still need a driver assigned.`,
        table:
          unassigned.length > 0
            ? {
                columns: [
                  { key: "id", label: "Order" },
                  { key: "customer", label: "Customer" },
                  { key: "created", label: "Created" },
                ],
                rows: unassigned.map((o) => ({
                  id: o.id,
                  customer: getCustomer(o.customerId, customers)?.name ?? "Unknown",
                  created: formatDate(o.createdAt),
                })),
              }
            : undefined,
        emptyNote: unassigned.length === 0 ? "Every pending order has a driver." : undefined,
        explanation:
          "An order is \"unassigned\" when it's Pending with no driver or vehicle linked yet.",
        links: [{ label: "Open Dispatch Board", href: "/dispatch" }],
        recommendations: unassigned.slice(0, 3).map((o) => ({
          label: `Assign a driver to ${o.id}`,
          href: "/dispatch",
          priority: "high",
        })),
      };
    },
  },
  {
    id: "ops-cancelled",
    category: "operations",
    match: matches(/cancel/i),
    handle: ({ orders, customers }, question) => {
      const useWeek = /week/i.test(question);
      const option: DateRangeOption = useWeek ? "this_week" : "this_month";
      const bounds = resolveDateRange(option, getReferenceNow());
      const cancelled = orders.filter((o) => {
        if (o.status !== "cancelled") return false;
        const entry = o.statusHistory.find((h) => h.status === "cancelled");
        return entry ? isWithinRange(entry.at, bounds) : false;
      });
      return {
        category: "operations",
        answer:
          cancelled.length === 0
            ? `No orders were cancelled ${useWeek ? "this week" : "this month"}.`
            : `${cancelled.length} order${cancelled.length === 1 ? " was" : "s were"} cancelled ${useWeek ? "this week" : "this month"}.`,
        table:
          cancelled.length > 0
            ? {
                columns: [
                  { key: "id", label: "Order" },
                  { key: "customer", label: "Customer" },
                  { key: "at", label: "Cancelled" },
                ],
                rows: cancelled.map((o) => ({
                  id: o.id,
                  customer: getCustomer(o.customerId, customers)?.name ?? "Unknown",
                  at: formatDate(o.statusHistory.find((h) => h.status === "cancelled")!.at),
                })),
              }
            : undefined,
        emptyNote: cancelled.length === 0 ? "No cancellations in this period." : undefined,
        explanation: `Counts orders cancelled since the start of ${useWeek ? "this week" : "this month"}.`,
        links: [{ label: "View Orders", href: "/orders" }],
      };
    },
  },
  {
    id: "ops-delivered-no-invoice",
    category: "operations",
    match: matches(/deliver/i, /invoice/i, /not|without|missing/i),
    handle: ({ orders, expenses, invoices, customers }) => {
      const list = getOrderExceptions(orders, expenses, invoices).deliveredWithoutInvoice;
      return {
        category: "operations",
        answer:
          list.length === 0
            ? "Every delivered order has an invoice."
            : `${list.length} delivered order${list.length === 1 ? "" : "s"} still need an invoice.`,
        table:
          list.length > 0
            ? {
                columns: [
                  { key: "id", label: "Order" },
                  { key: "customer", label: "Customer" },
                  { key: "amount", label: "Amount" },
                ],
                rows: list.map((o) => ({
                  id: o.id,
                  customer: getCustomer(o.customerId, customers)?.name ?? "Unknown",
                  amount: formatCurrency(o.amount),
                })),
              }
            : undefined,
        emptyNote: list.length === 0 ? "Billing is fully caught up." : undefined,
        explanation:
          "Delivered orders with no invoice record at all — the same check used for Notifications.",
        links: [{ label: "Open Finance", href: "/finance" }],
        recommendations: list.slice(0, 3).map((o) => ({
          label: `Create an invoice for ${o.id}`,
          href: "/finance",
          priority: "medium",
        })),
      };
    },
  },
  {
    id: "ops-biggest-risks",
    category: "operations",
    match: matches(/risk/i, /operat/i),
    handle: (data) => {
      const top = getNotifications(data, data.notificationThresholds)
        .filter((n) => n.category === "operations" || n.category === "fleet")
        .slice(0, 5);
      return {
        category: "operations",
        answer:
          top.length === 0
            ? "No significant operational risks right now."
            : `${top.length} operational risk${top.length === 1 ? "" : "s"} need attention, ranked by priority.`,
        table:
          top.length > 0
            ? {
                columns: [
                  { key: "title", label: "Issue" },
                  { key: "priority", label: "Priority" },
                ],
                rows: top.map((n) => ({
                  title: n.title,
                  priority: notificationPriorityMeta[n.priority].label,
                })),
              }
            : undefined,
        emptyNote: top.length === 0 ? "Operations are running smoothly." : undefined,
        recommendations: top.map((n) => ({
          label: n.recommendedAction,
          href: n.href,
          priority: n.priority,
        })),
        explanation:
          "Pulled from the same rules engine that powers the Notifications center, filtered to Operations and Fleet.",
        links: [{ label: "Open Notifications", href: "/notifications" }],
      };
    },
  },
  {
    id: "fin-top-debtors",
    category: "finance",
    match: matches(/customer/i, /outstanding|indebted|owe|debt/i),
    handle: ({ customers, invoices }) => {
      const ranked = customers
        .map((c) => ({ customer: c, balance: getCustomerOutstandingBalance(c.id, invoices) }))
        .filter((r) => r.balance > 0)
        .sort((a, b) => b.balance - a.balance)
        .slice(0, 5);
      return {
        category: "finance",
        answer:
          ranked.length === 0
            ? "No customers currently have an outstanding balance."
            : "Top customers by outstanding balance:",
        table:
          ranked.length > 0
            ? {
                columns: [
                  { key: "customer", label: "Customer" },
                  { key: "balance", label: "Outstanding" },
                ],
                rows: ranked.map((r) => ({
                  customer: r.customer.name,
                  balance: formatCurrency(r.balance),
                })),
              }
            : undefined,
        emptyNote: ranked.length === 0 ? "All invoices are paid up." : undefined,
        explanation: "Outstanding balance is the sum of each customer's unpaid invoice amounts.",
        links: [
          { label: "Open Customers", href: "/customers" },
          { label: "Open Finance", href: "/finance" },
        ],
      };
    },
  },
  {
    id: "fin-overdue-invoices",
    category: "finance",
    match: matches(/invoice/i, /overdue/i),
    handle: ({ invoices, customers }) => {
      const overdue = invoices
        .filter((i) => getInvoiceStatus(i) === "overdue")
        .sort((a, b) => getInvoiceOverdueDays(b) - getInvoiceOverdueDays(a));
      return {
        category: "finance",
        answer:
          overdue.length === 0
            ? "No invoices are overdue."
            : `${overdue.length} invoice${overdue.length === 1 ? " is" : "s are"} overdue.`,
        table:
          overdue.length > 0
            ? {
                columns: [
                  { key: "id", label: "Invoice" },
                  { key: "customer", label: "Customer" },
                  { key: "remaining", label: "Remaining" },
                  { key: "days", label: "Days overdue" },
                ],
                rows: overdue.slice(0, 10).map((i) => ({
                  id: i.id,
                  customer: getCustomer(i.customerId, customers)?.name ?? "Unknown",
                  remaining: formatCurrency(getInvoiceRemaining(i)),
                  days: String(getInvoiceOverdueDays(i)),
                })),
              }
            : undefined,
        emptyNote: overdue.length === 0 ? "Collections are current." : undefined,
        explanation: "An invoice is overdue once its due date has passed with a balance remaining.",
        links: [{ label: "Open Finance", href: "/finance" }],
        recommendations: overdue.slice(0, 3).map((i) => ({
          label: `Follow up on ${i.id}`,
          href: "/finance",
          priority: "critical",
        })),
      };
    },
  },
  {
    id: "fin-collected-month",
    category: "finance",
    match: matches(/collect/i),
    handle: (data) => {
      const { stats } = execStatsFor(data, "this_month");
      return {
        category: "finance",
        answer: `${formatCurrency(stats.collectedPayments)} has been collected this month.`,
        metrics: [
          { label: "Collected this month", value: formatCurrency(stats.collectedPayments), tone: "positive" },
          {
            label: "Outstanding receivables",
            value: formatCurrency(stats.outstandingReceivables),
            tone: stats.outstandingReceivables > 0 ? "negative" : "positive",
          },
        ],
        explanation:
          "Sum of all payments recorded this month across all invoices — matches the Finance dashboard.",
        links: [{ label: "Open Finance", href: "/finance" }],
      };
    },
  },
  {
    id: "fin-profitable-routes",
    category: "finance",
    match: matches(/route/i, /profit/i),
    handle: ({ orders, expenses }) => {
      const routes = getRouteProfitability(orders, expenses).slice(0, 5);
      return {
        category: "finance",
        answer:
          routes.length === 0
            ? "No completed deliveries yet to rank routes."
            : "Most profitable routes based on completed deliveries:",
        table:
          routes.length > 0
            ? {
                columns: [
                  { key: "route", label: "Route" },
                  { key: "orders", label: "Orders" },
                  { key: "profit", label: "Profit" },
                ],
                rows: routes.map((r) => ({
                  route: r.route,
                  orders: String(r.orderCount),
                  profit: formatCurrency(r.profit),
                })),
              }
            : undefined,
        emptyNote: routes.length === 0 ? "No delivered orders yet." : undefined,
        explanation: "Profit per route is delivered-order revenue minus approved expenses on those orders.",
        links: [{ label: "Open Reports", href: "/reports" }],
      };
    },
  },
  {
    id: "fin-negative-profit",
    category: "finance",
    match: matches(/profit/i, /negative|loss/i),
    handle: ({ orders, expenses, invoices, customers }) => {
      const list = getOrderExceptions(orders, expenses, invoices).negativeProfit;
      return {
        category: "finance",
        answer:
          list.length === 0
            ? "No delivered orders are running at a loss."
            : `${list.length} delivered order${list.length === 1 ? " is" : "s are"} running at a loss.`,
        table:
          list.length > 0
            ? {
                columns: [
                  { key: "id", label: "Order" },
                  { key: "customer", label: "Customer" },
                  { key: "profit", label: "Profit" },
                ],
                rows: list.map((o) => ({
                  id: o.id,
                  customer: getCustomer(o.customerId, customers)?.name ?? "Unknown",
                  profit: formatCurrency(getOrderProfit(o, expenses, invoices)),
                })),
              }
            : undefined,
        emptyNote: list.length === 0 ? "Every delivered order is profitable." : undefined,
        explanation: "Profit is order revenue minus approved expenses linked to that order.",
        links: [{ label: "View Orders", href: "/orders" }],
        recommendations: list.slice(0, 3).map((o) => ({
          label: `Review expenses on ${o.id}`,
          href: "/orders",
          priority: "high",
        })),
      };
    },
  },
  {
    id: "fin-gross-profit-month",
    category: "finance",
    match: matches(/profit/i, /month/i),
    handle: (data) => {
      const { stats } = execStatsFor(data, "this_month");
      return {
        category: "finance",
        answer: `Estimated gross profit this month is ${formatCurrency(stats.grossProfit)} (${stats.grossMarginPercent.toFixed(1)}% margin).`,
        metrics: [
          { label: "Revenue", value: formatCurrency(stats.revenue), tone: "positive" },
          { label: "Approved expenses", value: formatCurrency(stats.approvedExpenses), tone: "negative" },
          {
            label: "Gross profit",
            value: formatCurrency(stats.grossProfit),
            tone: stats.grossProfit >= 0 ? "positive" : "negative",
          },
          { label: "Gross margin", value: `${stats.grossMarginPercent.toFixed(1)}%` },
        ],
        explanation:
          "Gross profit = delivered-order revenue minus approved expenses, for orders created this month.",
        links: [{ label: "Open Reports", href: "/reports" }],
      };
    },
  },
  {
    id: "fin-receivables-aging",
    category: "finance",
    match: matches(/aging|receivables/i),
    handle: ({ invoices }) => {
      const buckets = getReceivablesAging(invoices).filter((b) => b.count > 0);
      return {
        category: "finance",
        answer:
          buckets.length === 0
            ? "There are no outstanding receivables."
            : "Here's the current receivables aging breakdown:",
        table:
          buckets.length > 0
            ? {
                columns: [
                  { key: "label", label: "Bucket" },
                  { key: "count", label: "Invoices" },
                  { key: "amount", label: "Amount" },
                ],
                rows: buckets.map((b) => ({
                  label: b.label,
                  count: String(b.count),
                  amount: formatCurrency(b.amount),
                })),
              }
            : undefined,
        emptyNote: buckets.length === 0 ? "All invoices are settled." : undefined,
        explanation: "Groups unpaid invoice balances by how many days past their due date they are.",
        links: [{ label: "Open Reports", href: "/reports" }],
      };
    },
  },
  {
    id: "fleet-available-drivers",
    category: "fleet",
    match: matches(/driver/i, /free|available|bo'?sh/i),
    handle: ({ drivers }) => {
      const free = drivers.filter((d) => d.status === "available");
      return {
        category: "fleet",
        answer:
          free.length === 0
            ? "No drivers are available right now."
            : `${free.length} driver${free.length === 1 ? "" : "s"} available right now.`,
        table:
          free.length > 0
            ? {
                columns: [
                  { key: "driver", label: "Driver" },
                  { key: "onTime", label: "On-time rate" },
                ],
                rows: free.map((d) => ({ driver: d.name, onTime: `${d.onTimeRate}%` })),
              }
            : undefined,
        emptyNote: free.length === 0 ? "All drivers are on delivery or off duty." : undefined,
        explanation: "Shows drivers whose current status is Available.",
        links: [{ label: "View Drivers & Vehicles", href: "/drivers" }],
      };
    },
  },
  {
    id: "fleet-vehicles-status",
    category: "fleet",
    match: matches(/vehicle/i, /available|maintenance/i),
    handle: ({ vehicles }) => {
      const available = vehicles.filter((v) => v.status === "available");
      const maintenance = vehicles.filter((v) => v.status === "maintenance");
      const rows = [
        ...available.map((v) => ({ vehicle: `${v.model} (${v.plate})`, status: "Available" })),
        ...maintenance.map((v) => ({ vehicle: `${v.model} (${v.plate})`, status: "Maintenance" })),
      ];
      return {
        category: "fleet",
        answer: `${available.length} vehicle${available.length === 1 ? "" : "s"} available, ${maintenance.length} in maintenance.`,
        metrics: [
          { label: "Available", value: String(available.length), tone: "positive" },
          {
            label: "In maintenance",
            value: String(maintenance.length),
            tone: maintenance.length > 0 ? "negative" : "neutral",
          },
        ],
        table: rows.length > 0 ? { columns: [{ key: "vehicle", label: "Vehicle" }, { key: "status", label: "Status" }], rows } : undefined,
        explanation: "Reflects each vehicle's current status in the fleet registry.",
        links: [{ label: "View Drivers & Vehicles", href: "/drivers" }],
      };
    },
  },
  {
    id: "fleet-vehicle-expenses",
    category: "fleet",
    match: matches(/vehicle/i, /expense|cost/i),
    handle: ({ vehicles, expenses }) => {
      const ranked = vehicles
        .map((v) => ({ vehicle: v, total: getVehicleExpenseTotal(v.id, expenses) }))
        .filter((r) => r.total > 0)
        .sort((a, b) => b.total - a.total);
      const top = ranked[0];
      return {
        category: "fleet",
        answer: !top
          ? "No approved expenses are linked to any vehicle yet."
          : `${top.vehicle.model} (${top.vehicle.plate}) has the highest approved expenses at ${formatCurrency(top.total)}.`,
        table:
          ranked.length > 0
            ? {
                columns: [
                  { key: "vehicle", label: "Vehicle" },
                  { key: "total", label: "Approved expenses" },
                ],
                rows: ranked.slice(0, 5).map((r) => ({
                  vehicle: `${r.vehicle.model} (${r.vehicle.plate})`,
                  total: formatCurrency(r.total),
                })),
              }
            : undefined,
        emptyNote: !top ? "No expenses recorded yet." : undefined,
        explanation: "Only approved expenses linked to a vehicle are counted, matching Finance's rules.",
        links: [{ label: "Open Finance", href: "/finance" }],
      };
    },
  },
  {
    id: "fleet-maintenance-deadlines",
    category: "fleet",
    match: matches(/maintenance|document/i, /due|deadline|coming|upcoming|expir/i),
    handle: ({ vehicles, drivers, notificationThresholds }) => {
      const dueVehicles = vehicles.filter((v) =>
        isMaintenanceDueSoon(v.nextMaintenanceAt, notificationThresholds.maintenanceDueSoonDays),
      );
      const expiringDrivers = drivers.filter((d) =>
        isLicenseExpiringSoon(d.licenseExpiresAt, notificationThresholds.documentExpiryDueSoonDays),
      );
      const rows = [
        ...dueVehicles.map((v) => ({
          item: `${v.model} (${v.plate})`,
          type: "Maintenance",
          due: formatDate(v.nextMaintenanceAt),
        })),
        ...expiringDrivers.map((d) => ({
          item: d.name,
          type: "License expiry",
          due: formatDate(d.licenseExpiresAt),
        })),
      ];
      return {
        category: "fleet",
        answer:
          rows.length === 0
            ? "No maintenance or document deadlines are coming up."
            : `${rows.length} upcoming maintenance/document deadline${rows.length === 1 ? "" : "s"}.`,
        table:
          rows.length > 0
            ? {
                columns: [
                  { key: "item", label: "Item" },
                  { key: "type", label: "Type" },
                  { key: "due", label: "Due" },
                ],
                rows,
              }
            : undefined,
        emptyNote: rows.length === 0 ? "Fleet documentation is up to date." : undefined,
        explanation: "Uses your configured maintenance and document-expiry thresholds from Notification Settings.",
        links: [{ label: "View Drivers & Vehicles", href: "/drivers" }],
        recommendations: dueVehicles.slice(0, 2).map((v) => ({
          label: `Schedule maintenance for ${v.model} (${v.plate})`,
          href: "/drivers",
          priority: "medium",
        })),
      };
    },
  },
  {
    id: "cust-at-risk",
    category: "customers",
    match: matches(/customer/i, /risk/i),
    handle: ({ customers }) => {
      const atRisk = customers.filter((c) => c.status === "at_risk");
      return {
        category: "customers",
        answer:
          atRisk.length === 0
            ? "No customers are currently marked At Risk."
            : `${atRisk.length} customer${atRisk.length === 1 ? " is" : "s are"} marked At Risk.`,
        table:
          atRisk.length > 0
            ? {
                columns: [
                  { key: "customer", label: "Customer" },
                  { key: "industry", label: "Industry" },
                ],
                rows: atRisk.map((c) => ({ customer: c.name, industry: c.industry })),
              }
            : undefined,
        emptyNote: atRisk.length === 0 ? "No at-risk customers right now." : undefined,
        explanation: "Reflects each customer's manually-set CRM status.",
        links: [{ label: "Open Customers", href: "/customers" }],
        recommendations: atRisk.slice(0, 3).map((c) => ({
          label: `Review ${c.name} before accepting new orders`,
          href: "/customers",
          priority: "medium",
        })),
      };
    },
  },
  {
    id: "cust-credit-limit",
    category: "customers",
    match: matches(/customer/i, /credit/i),
    handle: ({ customers, invoices, notificationThresholds }) => {
      const rows = customers
        .filter((c) => c.status !== "archived" && c.creditLimit > 0)
        .map((c) => {
          const outstanding = getCustomerOutstandingBalance(c.id, invoices);
          return { customer: c, outstanding, usedPercent: (outstanding / c.creditLimit) * 100 };
        })
        .filter((r) => r.usedPercent >= notificationThresholds.creditLimitWarningPercent)
        .sort((a, b) => b.usedPercent - a.usedPercent);
      return {
        category: "customers",
        answer:
          rows.length === 0
            ? "No customers are near their credit limit."
            : `${rows.length} customer${rows.length === 1 ? " is" : "s are"} near or above their credit limit.`,
        table:
          rows.length > 0
            ? {
                columns: [
                  { key: "customer", label: "Customer" },
                  { key: "used", label: "Used" },
                  { key: "limit", label: "Limit" },
                ],
                rows: rows.map((r) => ({
                  customer: r.customer.name,
                  used: `${r.usedPercent.toFixed(0)}%`,
                  limit: formatCurrency(r.customer.creditLimit),
                })),
              }
            : undefined,
        emptyNote: rows.length === 0 ? "Everyone is comfortably within their credit limit." : undefined,
        explanation: `Shows customers using ${notificationThresholds.creditLimitWarningPercent}% or more of their credit limit, based on outstanding invoice balances.`,
        links: [{ label: "Open Customers", href: "/customers" }],
        recommendations: rows.slice(0, 3).map((r) => ({
          label: `Contact ${r.customer.name} about their balance`,
          href: "/customers",
          priority: r.usedPercent >= 100 ? "critical" : "high",
        })),
      };
    },
  },
  {
    id: "cust-overdue-balance",
    category: "customers",
    match: matches(/customer/i, /overdue/i),
    handle: ({ customers, invoices }) => {
      const rows = customers
        .map((c) => ({ customer: c, overdue: getCustomerOverdueBalance(c.id, invoices) }))
        .filter((r) => r.overdue > 0)
        .sort((a, b) => b.overdue - a.overdue);
      return {
        category: "customers",
        answer:
          rows.length === 0
            ? "No customers have an overdue balance."
            : `${rows.length} customer${rows.length === 1 ? " has" : "s have"} an overdue balance.`,
        table:
          rows.length > 0
            ? {
                columns: [
                  { key: "customer", label: "Customer" },
                  { key: "overdue", label: "Overdue" },
                ],
                rows: rows.map((r) => ({ customer: r.customer.name, overdue: formatCurrency(r.overdue) })),
              }
            : undefined,
        emptyNote: rows.length === 0 ? "Every customer is current on payments." : undefined,
        explanation: "Sums each customer's invoices that are past due with a remaining balance.",
        links: [{ label: "Open Customers", href: "/customers" }],
        recommendations: rows.slice(0, 3).map((r) => ({
          label: `Follow up with ${r.customer.name}`,
          href: "/customers",
          priority: "high",
        })),
      };
    },
  },
  {
    id: "cust-top-revenue",
    category: "customers",
    match: matches(/customer/i, /revenue/i),
    handle: ({ customers, orders }) => {
      const ranked = customers
        .map((c) => ({ customer: c, revenue: getCustomerLifetimeValue(c.id, orders) }))
        .filter((r) => r.revenue > 0)
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5);
      return {
        category: "customers",
        answer:
          ranked.length === 0
            ? "No delivered orders yet to rank customers by revenue."
            : "Top customers by lifetime revenue:",
        table:
          ranked.length > 0
            ? {
                columns: [
                  { key: "customer", label: "Customer" },
                  { key: "revenue", label: "Revenue" },
                ],
                rows: ranked.map((r) => ({ customer: r.customer.name, revenue: formatCurrency(r.revenue) })),
              }
            : undefined,
        emptyNote: ranked.length === 0 ? "No delivered orders recorded yet." : undefined,
        explanation: "Lifetime revenue is the sum of a customer's delivered-order amounts.",
        links: [{ label: "Open Customers", href: "/customers" }],
      };
    },
  },
  {
    id: "reports-summarize-month",
    category: "reports",
    match: matches(/summar/i, /month|performance/i),
    handle: (data) => {
      const { stats } = execStatsFor(data, "this_month");
      return {
        category: "reports",
        answer: `This month: ${stats.deliveredOrders} delivered orders, ${formatCurrency(stats.revenue)} revenue, ${stats.grossMarginPercent.toFixed(1)}% gross margin.`,
        metrics: [
          { label: "Total orders", value: String(stats.totalOrders) },
          { label: "Delivered", value: String(stats.deliveredOrders) },
          {
            label: "On-time rate",
            value: `${stats.onTimeRatePercent}%`,
            tone: stats.onTimeRatePercent >= 90 ? "positive" : "negative",
          },
          { label: "Revenue", value: formatCurrency(stats.revenue), tone: "positive" },
          { label: "Collected", value: formatCurrency(stats.collectedPayments) },
          {
            label: "Gross profit",
            value: formatCurrency(stats.grossProfit),
            tone: stats.grossProfit >= 0 ? "positive" : "negative",
          },
        ],
        explanation:
          "Calculated from all orders created this month, using the same logic as Reports > Executive Overview.",
        links: [{ label: "Open Reports", href: "/reports" }],
      };
    },
  },
  {
    id: "reports-compare-months",
    category: "reports",
    match: matches(/compare/i),
    handle: (data) => {
      const bounds = resolveDateRange("this_month", getReferenceNow());
      const prevBounds = getPreviousPeriodBounds(bounds);
      const current = computeExecutiveStats(data, defaultReportFilters, bounds);
      const previous = computeExecutiveStats(data, defaultReportFilters, prevBounds);
      const revenueChange = percentChange(current.revenue, previous.revenue);
      return {
        category: "reports",
        answer:
          revenueChange === null
            ? "Revenue is flat compared to last month."
            : `Revenue is ${revenueChange >= 0 ? "up" : "down"} ${Math.abs(revenueChange).toFixed(1)}% vs last month.`,
        metrics: [
          { label: "Revenue (this month)", value: formatCurrency(current.revenue) },
          { label: "Revenue (last month)", value: formatCurrency(previous.revenue) },
          {
            label: "Gross profit (this month)",
            value: formatCurrency(current.grossProfit),
            tone: current.grossProfit >= 0 ? "positive" : "negative",
          },
          { label: "Gross profit (last month)", value: formatCurrency(previous.grossProfit) },
          {
            label: "Delivered orders (this vs last)",
            value: `${current.deliveredOrders} vs ${previous.deliveredOrders}`,
          },
        ],
        explanation:
          "Compares the current calendar month against the immediately preceding period of equal length.",
        links: [{ label: "Open Reports", href: "/reports" }],
      };
    },
  },
  {
    id: "reports-management-summary-today",
    category: "reports",
    match: matches(/management|today/i, /summar/i),
    handle: (data) => {
      const bounds = resolveDateRange("today", getReferenceNow());
      const stats = computeExecutiveStats(data, defaultReportFilters, bounds);
      const notifications = getNotifications(data, data.notificationThresholds)
        .filter((n) => n.priority === "critical" || n.priority === "high")
        .slice(0, 5);
      return {
        category: "reports",
        answer: `Today: ${stats.totalOrders} orders created, ${stats.delayedDeliveries} delayed, ${formatCurrency(stats.revenue)} revenue from delivered orders.`,
        metrics: [
          { label: "Orders today", value: String(stats.totalOrders) },
          {
            label: "Delayed",
            value: String(stats.delayedDeliveries),
            tone: stats.delayedDeliveries > 0 ? "negative" : "positive",
          },
          { label: "Revenue", value: formatCurrency(stats.revenue) },
        ],
        table:
          notifications.length > 0
            ? {
                columns: [
                  { key: "title", label: "Issue" },
                  { key: "priority", label: "Priority" },
                ],
                rows: notifications.map((n) => ({
                  title: n.title,
                  priority: notificationPriorityMeta[n.priority].label,
                })),
              }
            : undefined,
        recommendations: notifications.map((n) => ({
          label: n.recommendedAction,
          href: n.href,
          priority: n.priority,
        })),
        explanation: "Combines today's executive stats with the highest-priority items from Notifications.",
        links: [
          { label: "Open Notifications", href: "/notifications" },
          { label: "Open Reports", href: "/reports" },
        ],
      };
    },
  },
  {
    id: "reports-focus-first",
    category: "reports",
    match: matches(/focus/i),
    handle: (data) => {
      const notifications = getNotifications(data, data.notificationThresholds)
        .filter((n) => n.priority === "critical" || n.priority === "high")
        .slice(0, 5);
      return {
        category: "reports",
        answer:
          notifications.length === 0
            ? "Nothing urgent right now — no critical or high-priority issues."
            : `Focus on these ${notifications.length} item${notifications.length === 1 ? "" : "s"} first, ranked by priority.`,
        table:
          notifications.length > 0
            ? {
                columns: [
                  { key: "title", label: "Issue" },
                  { key: "priority", label: "Priority" },
                ],
                rows: notifications.map((n) => ({
                  title: n.title,
                  priority: notificationPriorityMeta[n.priority].label,
                })),
              }
            : undefined,
        emptyNote:
          notifications.length === 0
            ? "All caught up — check back after new orders or invoices come in."
            : undefined,
        recommendations: notifications.map((n) => ({
          label: n.recommendedAction,
          href: n.href,
          priority: n.priority,
        })),
        explanation:
          "Ranked using the same priority rules as the Notifications center (critical > high > medium > low).",
        links: [{ label: "Open Notifications", href: "/notifications" }],
      };
    },
  },
];

const FALLBACK_ANSWER =
  "I can answer questions about deliveries, drivers, invoices, customers and reports based on your live ERP data. Try one of the suggested prompts below, or rephrase your question.";

export function askAssistant(question: string, data: AssistantData): AssistantResponse {
  const trimmed = question.trim();
  for (const intent of intents) {
    if (intent.match(trimmed)) {
      return intent.handle(data, trimmed);
    }
  }
  return { category: "operations", answer: FALLBACK_ANSWER };
}

export const suggestedPromptsByCategory: Record<IntentCategory, string[]> = {
  operations: [
    "Which deliveries are delayed today?",
    "Which orders are unassigned?",
    "Which deliveries are due within the next 2 hours?",
    "Show cancelled orders this week",
    "Which orders were delivered but not invoiced?",
    "What are the biggest operational risks today?",
  ],
  finance: [
    "Show top customers by outstanding balance",
    "Which invoices are overdue?",
    "How much was collected this month?",
    "What is the estimated gross profit this month?",
    "Which orders have negative profit?",
    "Which routes are most profitable?",
    "Show receivables aging",
  ],
  fleet: [
    "Which drivers are available now?",
    "Which vehicles are available or in maintenance?",
    "Which vehicle has the highest approved expenses?",
    "Which driver has the most delayed deliveries?",
    "What maintenance or document deadlines are coming up?",
  ],
  customers: [
    "Which customers are at risk?",
    "Which customers are near or above their credit limit?",
    "Show customers with overdue balances",
    "Who are the top customers by revenue?",
  ],
  reports: [
    "Summarize this month's performance",
    "Compare this month with last month",
    "Give me a management summary for today",
    "What should I focus on first?",
  ],
};
