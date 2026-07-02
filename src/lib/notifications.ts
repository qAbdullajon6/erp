import {
  formatCurrency,
  formatDate,
  getCustomer,
  getInvoiceRemaining,
  getInvoiceStatus,
  isDeliveryDueSoon,
  isLicenseExpiringSoon,
  isMaintenanceDueSoon,
  isOrderDelayed,
  isOrderUnassignedTooLong,
} from "@/lib/mock-data";
import type { Customer, Driver, Invoice, Order, Vehicle } from "@/lib/types";

export type NotificationSeverity = "critical" | "warning" | "info";

export interface AppNotification {
  id: string;
  severity: NotificationSeverity;
  title: string;
  description: string;
  href: string;
}

interface NotificationData {
  orders: Order[];
  drivers: Driver[];
  vehicles: Vehicle[];
  invoices: Invoice[];
  customers: Customer[];
}

const severityRank: Record<NotificationSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

export function getNotifications(data: NotificationData): AppNotification[] {
  const notifications: AppNotification[] = [];

  for (const o of data.orders) {
    if (isOrderDelayed(o)) {
      notifications.push({
        id: `order-delayed-${o.id}`,
        severity: "critical",
        title: `${o.id} is delayed`,
        description: `Delivery to ${o.destination} was due ${formatDate(o.deliveryDate)}`,
        href: "/orders",
      });
    } else if (isDeliveryDueSoon(o)) {
      notifications.push({
        id: `order-due-soon-${o.id}`,
        severity: "warning",
        title: `${o.id} delivery due soon`,
        description: `Due ${formatDate(o.deliveryDate)} to ${o.destination}`,
        href: "/orders",
      });
    }

    if (isOrderUnassignedTooLong(o)) {
      const customer = getCustomer(o.customerId, data.customers);
      notifications.push({
        id: `order-unassigned-${o.id}`,
        severity: "warning",
        title: `${o.id} has no driver assigned`,
        description: `${customer?.name ?? "Customer"}'s order is still pending assignment`,
        href: "/dispatch",
      });
    }
  }

  for (const inv of data.invoices) {
    if (getInvoiceStatus(inv) === "overdue") {
      const customer = getCustomer(inv.customerId, data.customers);
      notifications.push({
        id: `invoice-overdue-${inv.id}`,
        severity: "critical",
        title: `${inv.id} is overdue`,
        description: `${customer?.name ?? "Customer"} owes ${formatCurrency(getInvoiceRemaining(inv))}, due ${formatDate(inv.dueAt)}`,
        href: "/finance",
      });
    }
  }

  for (const d of data.drivers) {
    if (isLicenseExpiringSoon(d.licenseExpiresAt)) {
      notifications.push({
        id: `license-${d.id}`,
        severity: "warning",
        title: `${d.name}'s license is expiring soon`,
        description: `Expires ${formatDate(d.licenseExpiresAt)}`,
        href: "/drivers",
      });
    }
  }

  for (const v of data.vehicles) {
    if (isMaintenanceDueSoon(v.nextMaintenanceAt)) {
      notifications.push({
        id: `maintenance-${v.id}`,
        severity: "info",
        title: `${v.model} needs maintenance soon`,
        description: `${v.plate} · due ${formatDate(v.nextMaintenanceAt)}`,
        href: "/drivers",
      });
    }
  }

  return notifications.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
}
