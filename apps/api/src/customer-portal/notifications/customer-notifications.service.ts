import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import type { CurrentCustomerPayload } from "../auth/interfaces/current-customer.interface";

interface NotificationItem {
  key: string;
  type: "ORDER" | "INVOICE";
  title: string;
  message: string;
  entityType: string;
  entityId: string;
  createdAt: Date;
}

@Injectable()
export class CustomerNotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(payload: CurrentCustomerPayload, query?: { limit?: number }) {
    const limit = query?.limit ?? 50;
    const items = await this.buildFeed(payload, limit);
    const readSet = await this.readKeySet(payload.accountId);

    return {
      items: items.map((item) => ({ ...item, isRead: readSet.has(item.key) })),
    };
  }

  /// Computes the unread count directly from the two source tables rather
  /// than delegating to `list()` — the original recovered version called
  /// `list(payload, { limit: 200 })` here, which builds full title/message
  /// strings for 200 orders + 200 invoices just to throw all of it away
  /// except a count. This does the same two scoped queries `list()` needs,
  /// minus the string formatting, and the read-set lookup is a single
  /// `count()` rather than materializing every read row.
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

  /// Marks every currently-visible notification read in one statement.
  /// Fixed from the originally recovered version, which built raw SQL by
  /// hand-interpolating values into an `INSERT ... VALUES (...)` string via
  /// `$executeRawUnsafe` — a non-parameterized query is a SQL-injection-shaped
  /// pattern regardless of whether today's inputs happen to be safe
  /// (server-generated UUIDs), and one careless future edit to how `key` is
  /// built away from that guarantee. `createMany` with `skipDuplicates` is
  /// Prisma's own parameterized equivalent of the same "insert, ignore
  /// conflicts" behavior.
  async markAllRead(payload: CurrentCustomerPayload): Promise<void> {
    const items = await this.buildFeed(payload, 200);
    if (items.length === 0) return;

    await this.prisma.customerNotificationRead.createMany({
      data: items.map((item) => ({ accountId: payload.accountId, key: item.key })),
      skipDuplicates: true,
    });
  }

  /// The synthesized feed itself (no read-state), shared by list/unreadCount/
  /// markAllRead so all three agree on exactly which notifications exist.
  private async buildFeed(payload: CurrentCustomerPayload, limit: number): Promise<NotificationItem[]> {
    const orgId = payload.organizationId;
    const custId = payload.customerId;

    const [orders, invoices] = await Promise.all([
      this.prisma.order.findMany({
        where: { organizationId: orgId, customerId: custId },
        orderBy: { updatedAt: "desc" },
        take: limit,
        select: { id: true, orderNumber: true, status: true, updatedAt: true },
      }),
      this.prisma.invoice.findMany({
        where: {
          organizationId: orgId,
          customerId: custId,
          status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] },
        },
        orderBy: { updatedAt: "desc" },
        take: limit,
        select: { id: true, invoiceNumber: true, status: true, balanceDue: true, updatedAt: true },
      }),
    ]);

    const items: NotificationItem[] = [];
    for (const o of orders) {
      items.push({
        key: `order:${o.id}`,
        type: "ORDER",
        title: `Order ${o.orderNumber}`,
        message: `Status: ${o.status.replace(/_/g, " ")}`,
        entityType: "order",
        entityId: o.id,
        createdAt: o.updatedAt,
      });
    }
    for (const inv of invoices) {
      const due = inv.status === "OVERDUE" ? " (OVERDUE)" : "";
      items.push({
        key: `invoice:${inv.id}`,
        type: "INVOICE",
        // Balance formatted as a string via toFixed on the Decimal's own
        // string form — never a JS number — matching the money-serialization
        // convention this service otherwise didn't have a value to serialize
        // (this is a display string, not an API field), but stays consistent
        // with never doing arithmetic on a Decimal via Number().
        title: `Invoice ${inv.invoiceNumber}`,
        message: `Balance: ${inv.balanceDue.toString()}${due}`,
        entityType: "invoice",
        entityId: inv.id,
        createdAt: inv.updatedAt,
      });
    }

    return items;
  }

  private async readKeySet(accountId: string): Promise<Set<string>> {
    const rows = await this.prisma.customerNotificationRead.findMany({
      where: { accountId },
      select: { key: true },
    });
    return new Set(rows.map((r) => r.key));
  }
}
