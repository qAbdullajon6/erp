import {
  formatCurrency,
  formatDate,
  getCustomer,
  getCustomerOverdueBalance,
  getCustomerOutstandingBalance,
  getInvoiceRemaining,
  getInvoiceStatus,
  getOrderProfit,
  getReferenceNow,
  isDeliveryDueSoon,
  isLicenseExpiringSoon,
  isMaintenanceDueSoon,
  isOrderDelayed,
  isOrderUnassignedTooLong,
} from "@/lib/mock-data";
import type { NotificationThresholds } from "@/lib/notification-settings";
import type { Customer, Driver, Expense, Invoice, Order, Vehicle } from "@/lib/types";

export type NotificationPriority = "critical" | "high" | "medium" | "low";
export type NotificationCategory = "operations" | "finance" | "fleet" | "customers" | "system";

export interface AppNotification {
  id: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  title: string;
  description: string;
  at: string;
  href: string;
  recommendedAction: string;
}

interface NotificationData {
  orders: Order[];
  drivers: Driver[];
  vehicles: Vehicle[];
  invoices: Invoice[];
  customers: Customer[];
  expenses: Expense[];
}

const priorityRank: Record<NotificationPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;

function daysAgo(iso: string, now: number): number {
  return (now - new Date(iso).getTime()) / ONE_DAY_MS;
}

function hoursAgo(iso: string, now: number): number {
  return (now - new Date(iso).getTime()) / ONE_HOUR_MS;
}

export function getNotifications(
  data: NotificationData,
  thresholds: NotificationThresholds,
): AppNotification[] {
  const notifications: AppNotification[] = [];
  const now = getReferenceNow().getTime();

  // --- Operations ---
  for (const o of data.orders) {
    if (isOrderDelayed(o)) {
      notifications.push({
        id: `order-delayed-${o.id}`,
        category: "operations",
        priority: "critical",
        title: `${o.id} is delayed`,
        description: `Delivery to ${o.destination} was due ${formatDate(o.deliveryDate)}`,
        at: o.deliveryDate,
        href: "/orders",
        recommendedAction: "Check the driver's status and update the customer.",
      });
    } else if (isDeliveryDueSoon(o, thresholds.deliveryDueSoonHours)) {
      notifications.push({
        id: `order-due-soon-${o.id}`,
        category: "operations",
        priority: "medium",
        title: `${o.id} delivery due soon`,
        description: `Due ${formatDate(o.deliveryDate)} to ${o.destination}`,
        at: o.deliveryDate,
        href: "/orders",
        recommendedAction: "Confirm the delivery is on track.",
      });
    }

    if (isOrderUnassignedTooLong(o, thresholds.unassignedOrderHours)) {
      const customer = getCustomer(o.customerId, data.customers);
      notifications.push({
        id: `order-unassigned-${o.id}`,
        category: "operations",
        priority: "high",
        title: `${o.id} has no driver assigned`,
        description: `${customer?.name ?? "Customer"}'s order is still pending assignment`,
        at: o.createdAt,
        href: "/dispatch",
        recommendedAction: "Assign a driver and vehicle from the Dispatch Board.",
      });
    }

    if (
      o.status === "delivered" &&
      !data.invoices.some((i) => i.orderId === o.id) &&
      (() => {
        const deliveredEntry = o.statusHistory.find((h) => h.status === "delivered");
        return deliveredEntry && daysAgo(deliveredEntry.at, now) >= thresholds.deliveredWithoutInvoiceDays;
      })()
    ) {
      notifications.push({
        id: `no-invoice-${o.id}`,
        category: "operations",
        priority: "medium",
        title: `${o.id} delivered without an invoice`,
        description: `No invoice has been generated for this delivered order.`,
        at: o.statusHistory.find((h) => h.status === "delivered")?.at ?? o.createdAt,
        href: "/finance",
        recommendedAction: "Create an invoice for this order.",
      });
    }

    if (o.status === "cancelled") {
      const cancelledEntry = o.statusHistory.find((h) => h.status === "cancelled");
      if (cancelledEntry && daysAgo(cancelledEntry.at, now) <= 3) {
        notifications.push({
          id: `cancelled-review-${o.id}`,
          category: "operations",
          priority: "low",
          title: `${o.id} was cancelled`,
          description: "Cancelled orders should be reviewed for root cause.",
          at: cancelledEntry.at,
          href: "/orders",
          recommendedAction: "Review why this order was cancelled.",
        });
      }
    }
  }

  // --- Finance ---
  for (const inv of data.invoices) {
    const status = getInvoiceStatus(inv);
    if (status === "overdue") {
      const customer = getCustomer(inv.customerId, data.customers);
      notifications.push({
        id: `invoice-overdue-${inv.id}`,
        category: "finance",
        priority: "critical",
        title: `${inv.id} is overdue`,
        description: `${customer?.name ?? "Customer"} owes ${formatCurrency(getInvoiceRemaining(inv))}, due ${formatDate(inv.dueAt)}`,
        at: inv.dueAt,
        href: "/finance",
        recommendedAction: "Follow up with the customer for payment.",
      });
    } else if (status === "sent" || status === "partially_paid") {
      const daysUntilDue = -daysAgo(inv.dueAt, now);
      if (daysUntilDue >= 0 && daysUntilDue <= thresholds.invoiceDueSoonDays) {
        const customer = getCustomer(inv.customerId, data.customers);
        notifications.push({
          id: `invoice-due-soon-${inv.id}`,
          category: "finance",
          priority: "medium",
          title: `${inv.id} due soon`,
          description: `${customer?.name ?? "Customer"} · due ${formatDate(inv.dueAt)}`,
          at: inv.dueAt,
          href: "/finance",
          recommendedAction: "Send a payment reminder.",
        });
      }
    }

    for (const p of inv.payments) {
      if (hoursAgo(p.paidAt, now) <= 48) {
        const customer = getCustomer(inv.customerId, data.customers);
        notifications.push({
          id: `payment-recorded-${p.id}`,
          category: "finance",
          priority: "low",
          title: `Payment recorded on ${inv.id}`,
          description: `${customer?.name ?? "Customer"} paid ${formatCurrency(p.amount)}`,
          at: p.paidAt,
          href: "/finance",
          recommendedAction: "No action needed — informational.",
        });
      }
    }
  }

  for (const o of data.orders) {
    if (o.status !== "delivered") continue;
    const deliveredEntry = o.statusHistory.find((h) => h.status === "delivered");
    if (!deliveredEntry || daysAgo(deliveredEntry.at, now) > 30) continue;
    if (getOrderProfit(o, data.expenses, data.invoices) < 0) {
      notifications.push({
        id: `negative-profit-${o.id}`,
        category: "finance",
        priority: "high",
        title: `${o.id} delivered at a loss`,
        description: "Approved expenses exceed the order's revenue.",
        at: deliveredEntry.at,
        href: "/orders",
        recommendedAction: "Review linked expenses and pricing for this order.",
      });
    }
  }

  for (const c of data.customers) {
    if (c.status === "archived") continue;
    const outstanding = getCustomerOutstandingBalance(c.id, data.invoices);
    if (c.creditLimit <= 0) continue;
    const usedPercent = (outstanding / c.creditLimit) * 100;
    if (usedPercent >= 100) {
      notifications.push({
        id: `credit-limit-${c.id}`,
        category: "finance",
        priority: "critical",
        title: `${c.name} exceeded their credit limit`,
        description: `${formatCurrency(outstanding)} outstanding vs ${formatCurrency(c.creditLimit)} limit`,
        at: getReferenceNow().toISOString(),
        href: "/customers",
        recommendedAction: "Pause new orders until the balance is reduced.",
      });
    } else if (usedPercent >= thresholds.creditLimitWarningPercent) {
      notifications.push({
        id: `credit-limit-near-${c.id}`,
        category: "finance",
        priority: "high",
        title: `${c.name} is near their credit limit`,
        description: `${usedPercent.toFixed(0)}% of ${formatCurrency(c.creditLimit)} limit used`,
        at: getReferenceNow().toISOString(),
        href: "/customers",
        recommendedAction: "Consider requesting payment before accepting new orders.",
      });
    }
  }

  // --- Fleet ---
  for (const v of data.vehicles) {
    if (v.status === "maintenance") {
      notifications.push({
        id: `vehicle-in-maintenance-${v.id}`,
        category: "fleet",
        priority: "medium",
        title: `${v.model} is in maintenance`,
        description: `${v.plate} is currently unavailable for dispatch.`,
        at: v.lastMaintenanceAt,
        href: "/drivers",
        recommendedAction: "Confirm expected return-to-service date.",
      });
    } else if (isMaintenanceDueSoon(v.nextMaintenanceAt, thresholds.maintenanceDueSoonDays)) {
      notifications.push({
        id: `maintenance-due-${v.id}`,
        category: "fleet",
        priority: "low",
        title: `${v.model} needs maintenance soon`,
        description: `${v.plate} · due ${formatDate(v.nextMaintenanceAt)}`,
        at: v.nextMaintenanceAt,
        href: "/drivers",
        recommendedAction: "Schedule the next service window.",
      });
    }
  }

  for (const d of data.drivers) {
    if (isLicenseExpiringSoon(d.licenseExpiresAt, thresholds.documentExpiryDueSoonDays)) {
      notifications.push({
        id: `license-${d.id}`,
        category: "fleet",
        priority: "medium",
        title: `${d.name}'s license is expiring soon`,
        description: `Expires ${formatDate(d.licenseExpiresAt)}`,
        at: d.licenseExpiresAt,
        href: "/drivers",
        recommendedAction: "Remind the driver to renew their license.",
      });
    }
  }

  const activeOrderStatuses = ["assigned", "picked_up", "in_transit"];
  const driverActiveCounts = new Map<string, number>();
  const vehicleActiveCounts = new Map<string, number>();
  for (const o of data.orders) {
    if (!activeOrderStatuses.includes(o.status)) continue;
    if (o.driverId) driverActiveCounts.set(o.driverId, (driverActiveCounts.get(o.driverId) ?? 0) + 1);
    if (o.vehicleId) vehicleActiveCounts.set(o.vehicleId, (vehicleActiveCounts.get(o.vehicleId) ?? 0) + 1);
  }
  for (const [driverId, count] of driverActiveCounts) {
    if (count <= 1) continue;
    const driver = data.drivers.find((d) => d.id === driverId);
    notifications.push({
      id: `double-assignment-driver-${driverId}`,
      category: "fleet",
      priority: "high",
      title: `${driver?.name ?? "Driver"} is assigned to ${count} active orders`,
      description: "A driver should only have one active delivery at a time.",
      at: getReferenceNow().toISOString(),
      href: "/dispatch",
      recommendedAction: "Reassign one of the conflicting orders.",
    });
  }
  for (const [vehicleId, count] of vehicleActiveCounts) {
    if (count <= 1) continue;
    const vehicle = data.vehicles.find((v) => v.id === vehicleId);
    notifications.push({
      id: `double-assignment-vehicle-${vehicleId}`,
      category: "fleet",
      priority: "high",
      title: `${vehicle?.model ?? "Vehicle"} is assigned to ${count} active orders`,
      description: "A vehicle should only carry one active delivery at a time.",
      at: getReferenceNow().toISOString(),
      href: "/dispatch",
      recommendedAction: "Reassign one of the conflicting orders.",
    });
  }

  // --- Customers ---
  for (const c of data.customers) {
    if (c.status === "archived" && c.archivedAt && daysAgo(c.archivedAt, now) <= 7) {
      notifications.push({
        id: `customer-archived-${c.id}`,
        category: "customers",
        priority: "low",
        title: `${c.name} was archived`,
        description: "This customer is no longer active in the CRM.",
        at: c.archivedAt,
        href: "/customers",
        recommendedAction: "Confirm this was intentional.",
      });
    }
    if (c.status === "at_risk") {
      notifications.push({
        id: `customer-at-risk-${c.id}`,
        category: "customers",
        priority: "medium",
        title: `${c.name} is marked At Risk`,
        description: "Review recent orders and payment history.",
        at: getReferenceNow().toISOString(),
        href: "/customers",
        recommendedAction: "Reach out before accepting new orders.",
      });
    }
    const overdueBalance = getCustomerOverdueBalance(c.id, data.invoices);
    if (overdueBalance > 0) {
      notifications.push({
        id: `customer-overdue-${c.id}`,
        category: "customers",
        priority: "high",
        title: `${c.name} has an overdue balance`,
        description: formatCurrency(overdueBalance),
        at: getReferenceNow().toISOString(),
        href: "/customers",
        recommendedAction: "Follow up on the overdue invoice(s).",
      });
    }
  }

  return notifications.sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority]);
}
