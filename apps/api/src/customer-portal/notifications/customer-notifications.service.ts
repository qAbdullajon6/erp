import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { isScheduleLate } from "../../common/schedule-lateness.util";
import type { CurrentCustomerPayload } from "../auth/interfaces/current-customer.interface";
import {
  type CustomerNotificationPreferences,
  type NotificationPreferenceKey,
  resolveNotificationPreferences,
} from "./notification-preferences";

interface NotificationItem {
  key: string;
  type: "ORDER" | "INVOICE" | "PAYMENT" | "DOCUMENT";
  title: string;
  message: string;
  entityType: string;
  entityId: string;
  createdAt: Date;
  preferenceKey: NotificationPreferenceKey;
}

@Injectable()
export class CustomerNotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(payload: CurrentCustomerPayload, query?: { limit?: number }) {
    const limit = query?.limit ?? 50;
    const items = await this.buildFeed(payload, limit);
    const readSet = await this.readKeySet(payload.accountId);

    return {
      items: items.map(({ key, type, title, message, entityType, entityId, createdAt }) => ({
        key,
        type,
        title,
        message,
        entityType,
        entityId,
        createdAt,
        isRead: readSet.has(key),
      })),
    };
  }

  async unreadCount(payload: CurrentCustomerPayload) {
    const items = await this.buildFeed(payload, 200);
    if (items.length === 0) {
      return { unreadCount: 0 };
    }

    const readCount = await this.prisma.customerNotificationRead.count({
      where: { accountId: payload.accountId, key: { in: items.map((i) => i.key) } },
    });

    return { unreadCount: items.length - readCount };
  }

  async markRead(payload: CurrentCustomerPayload, key: string): Promise<void> {
    await this.prisma.customerNotificationRead.upsert({
      where: { accountId_key: { accountId: payload.accountId, key } },
      create: { accountId: payload.accountId, key },
      update: {},
    });
  }

  async markAllRead(payload: CurrentCustomerPayload): Promise<void> {
    const items = await this.buildFeed(payload, 200);
    if (items.length === 0) return;

    await this.prisma.customerNotificationRead.createMany({
      data: items.map((item) => ({ accountId: payload.accountId, key: item.key })),
      skipDuplicates: true,
    });
  }

  async getPreferences(payload: CurrentCustomerPayload): Promise<{
    preferences: CustomerNotificationPreferences;
    language: string;
    timezone: string;
  }> {
    const account = await this.prisma.customerPortalAccount.findUnique({
      where: { id: payload.accountId },
      select: { notificationPreferences: true, language: true, timezone: true },
    });
    return {
      preferences: resolveNotificationPreferences(account?.notificationPreferences),
      language: account?.language ?? "en",
      timezone: account?.timezone ?? "UTC",
    };
  }

  async updatePreferences(
    payload: CurrentCustomerPayload,
    input: {
      preferences?: Partial<CustomerNotificationPreferences>;
      language?: string;
      timezone?: string;
    },
  ) {
    const current = await this.getPreferences(payload);
    const nextPrefs = {
      ...current.preferences,
      ...(input.preferences ?? {}),
    };

    const updated = await this.prisma.customerPortalAccount.update({
      where: { id: payload.accountId },
      data: {
        notificationPreferences: nextPrefs,
        ...(input.language !== undefined ? { language: input.language } : {}),
        ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
      },
      select: { notificationPreferences: true, language: true, timezone: true },
    });

    return {
      preferences: resolveNotificationPreferences(updated.notificationPreferences),
      language: updated.language ?? "en",
      timezone: updated.timezone ?? "UTC",
    };
  }

  private async buildFeed(
    payload: CurrentCustomerPayload,
    limit: number,
  ): Promise<NotificationItem[]> {
    const orgId = payload.organizationId;
    const custId = payload.customerId;
    const now = new Date();

    const [account, orders, invoices, paidInvoices, dispatches] = await Promise.all([
      this.prisma.customerPortalAccount.findUnique({
        where: { id: payload.accountId },
        select: { notificationPreferences: true },
      }),
      this.prisma.order.findMany({
        where: { organizationId: orgId, customerId: custId },
        orderBy: { updatedAt: "desc" },
        take: limit,
        select: {
          id: true,
          orderNumber: true,
          status: true,
          deliveryDate: true,
          updatedAt: true,
        },
      }),
      this.prisma.invoice.findMany({
        where: {
          organizationId: orgId,
          customerId: custId,
          status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] },
        },
        orderBy: { updatedAt: "desc" },
        take: limit,
        select: {
          id: true,
          invoiceNumber: true,
          status: true,
          balanceDue: true,
          updatedAt: true,
          createdAt: true,
        },
      }),
      this.prisma.invoice.findMany({
        where: {
          organizationId: orgId,
          customerId: custId,
          status: "PAID",
          payments: { some: {} },
        },
        orderBy: { updatedAt: "desc" },
        take: Math.min(limit, 50),
        select: {
          id: true,
          invoiceNumber: true,
          updatedAt: true,
          payments: {
            orderBy: { paymentDate: "desc" },
            take: 1,
            select: { paymentDate: true, amount: true },
          },
        },
      }),
      this.prisma.dispatch.findMany({
        where: {
          organizationId: orgId,
          order: { customerId: custId },
          status: {
            in: [
              "EN_ROUTE_TO_PICKUP",
              "AT_PICKUP",
              "IN_TRANSIT",
              "ARRIVED_AT_DELIVERY",
              "CANCELLED",
              "DELIVERY_FAILED",
            ],
          },
        },
        orderBy: { updatedAt: "desc" },
        take: limit,
        select: {
          id: true,
          status: true,
          updatedAt: true,
          failedAt: true,
          order: { select: { id: true, orderNumber: true } },
        },
      }),
    ]);

    const prefs = resolveNotificationPreferences(account?.notificationPreferences);
    const items: NotificationItem[] = [];

    // Orders that have a DELIVERY_FAILED dispatch get a dedicated failure
    // notification — suppress the generic status pulse for those so the customer
    // does not see a confusing "Status: Pending" alongside the failure message.
    const failedOrderIds = new Set(
      dispatches.filter((d) => d.status === "DELIVERY_FAILED").map((d) => d.order.id),
    );

    for (const o of orders) {
      // DRAFT is pre-confirmation and never actually scheduled for dispatch —
      // excluded here the same way the status-pulse branch below excludes it,
      // so an unconfirmed order can't generate a false "delayed" notification.
      const delayed =
        isScheduleLate(o.deliveryDate, now) && !["DELIVERED", "CANCELLED", "DRAFT"].includes(o.status);

      if (delayed) {
        items.push({
          key: `order-delayed:${o.id}`,
          type: "ORDER",
          title: `Order ${o.orderNumber}`,
          message: "Delivery is delayed past the scheduled date.",
          entityType: "order",
          entityId: o.id,
          createdAt: o.updatedAt,
          preferenceKey: "shipmentDelayed",
        });
      }

      if (o.status === "DELIVERED") {
        items.push({
          key: `order-delivered:${o.id}`,
          type: "ORDER",
          title: `Order ${o.orderNumber}`,
          message: "Your shipment has been delivered.",
          entityType: "order",
          entityId: o.id,
          createdAt: o.updatedAt,
          preferenceKey: "shipmentDelivered",
        });
      } else if (o.status === "ASSIGNED") {
        items.push({
          key: `order-assigned:${o.id}`,
          type: "ORDER",
          title: `Order ${o.orderNumber}`,
          message: "A driver has been assigned to your shipment.",
          entityType: "order",
          entityId: o.id,
          createdAt: o.updatedAt,
          preferenceKey: "shipmentAssigned",
        });
      } else if (!delayed && o.status !== "DRAFT" && !failedOrderIds.has(o.id)) {
        // General status pulse for active statuses not covered by a more
        // specific notification. Skipped for orders with a DELIVERY_FAILED
        // dispatch so the dedicated failure notification takes precedence.
        items.push({
          key: `order:${o.id}`,
          type: "ORDER",
          title: `Order ${o.orderNumber}`,
          message: `Status: ${o.status.replace(/_/g, " ")}`,
          entityType: "order",
          entityId: o.id,
          createdAt: o.updatedAt,
          preferenceKey: "shipmentAssigned",
        });
      }
    }

    for (const d of dispatches) {
      if (d.status === "DELIVERY_FAILED") {
        items.push({
          key: `dispatch-failed:${d.id}`,
          type: "ORDER",
          title: `Order ${d.order.orderNumber}`,
          message: "We couldn't complete your delivery. A new delivery attempt may be arranged.",
          entityType: "order",
          entityId: d.order.id,
          createdAt: d.failedAt ?? d.updatedAt,
          preferenceKey: "shipmentFailed",
        });
      } else if (d.status === "EN_ROUTE_TO_PICKUP") {
        items.push({
          key: `dispatch-en-route:${d.id}`,
          type: "ORDER",
          title: `Order ${d.order.orderNumber}`,
          message: "Your driver is on the way to collect your shipment.",
          entityType: "order",
          entityId: d.order.id,
          createdAt: d.updatedAt,
          preferenceKey: "shipmentEnRoute",
        });
      } else if (d.status === "AT_PICKUP") {
        items.push({
          key: `dispatch-at-pickup:${d.id}`,
          type: "ORDER",
          title: `Order ${d.order.orderNumber}`,
          message: "Your driver has arrived at the pickup location.",
          entityType: "order",
          entityId: d.order.id,
          createdAt: d.updatedAt,
          preferenceKey: "shipmentEnRoute",
        });
      } else if (d.status === "IN_TRANSIT") {
        items.push({
          key: `dispatch-in-transit:${d.id}`,
          type: "ORDER",
          title: `Order ${d.order.orderNumber}`,
          message: "Your shipment is on its way to the delivery address.",
          entityType: "order",
          entityId: d.order.id,
          createdAt: d.updatedAt,
          preferenceKey: "shipmentInTransit",
        });
      } else if (d.status === "ARRIVED_AT_DELIVERY") {
        items.push({
          key: `dispatch-arrived:${d.id}`,
          type: "ORDER",
          title: `Order ${d.order.orderNumber}`,
          message: "Your driver has arrived at the delivery address.",
          entityType: "order",
          entityId: d.order.id,
          createdAt: d.updatedAt,
          preferenceKey: "shipmentArrived",
        });
      } else if (d.status === "CANCELLED") {
        items.push({
          key: `dispatch-cancelled:${d.id}`,
          type: "ORDER",
          title: `Order ${d.order.orderNumber}`,
          message: "Your shipment has been cancelled.",
          entityType: "order",
          entityId: d.order.id,
          createdAt: d.updatedAt,
          preferenceKey: "shipmentCancelled",
        });
      }
    }

    for (const inv of invoices) {
      if (inv.status === "OVERDUE") {
        items.push({
          key: `invoice-overdue:${inv.id}`,
          type: "INVOICE",
          title: `Invoice ${inv.invoiceNumber}`,
          message: `Overdue balance: ${inv.balanceDue.toString()}`,
          entityType: "invoice",
          entityId: inv.id,
          createdAt: inv.updatedAt,
          preferenceKey: "invoiceOverdue",
        });
      } else {
        items.push({
          key: `invoice:${inv.id}`,
          type: "INVOICE",
          title: `Invoice ${inv.invoiceNumber}`,
          message: `Balance: ${inv.balanceDue.toString()}`,
          entityType: "invoice",
          entityId: inv.id,
          createdAt: inv.updatedAt,
          preferenceKey: "invoiceCreated",
        });
      }
    }

    for (const inv of paidInvoices) {
      const payment = inv.payments[0];
      items.push({
        key: `payment:${inv.id}`,
        type: "PAYMENT",
        title: `Invoice ${inv.invoiceNumber}`,
        message: payment
          ? `Payment received: ${payment.amount.toString()}`
          : "Payment received.",
        entityType: "invoice",
        entityId: inv.id,
        createdAt: payment?.paymentDate ?? inv.updatedAt,
        preferenceKey: "paymentReceived",
      });
    }

    const filtered = items.filter((item) => prefs[item.preferenceKey]);
    filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return filtered.slice(0, limit);
  }

  private async readKeySet(accountId: string): Promise<Set<string>> {
    const rows = await this.prisma.customerNotificationRead.findMany({
      where: { accountId },
      select: { key: true },
    });
    return new Set(rows.map((r) => r.key));
  }
}
