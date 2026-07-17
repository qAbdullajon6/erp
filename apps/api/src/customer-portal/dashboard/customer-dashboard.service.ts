import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { OrdersService } from "../../orders/orders.service";
import { InvoicesService } from "../../invoices/invoices.service";
import type { CurrentCustomerPayload } from "../auth/interfaces/current-customer.interface";
import { CustomerNotificationsService } from "../notifications/customer-notifications.service";

@Injectable()
export class CustomerDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly invoices: InvoicesService,
    private readonly notifications: CustomerNotificationsService,
  ) {}

  async getDashboard(payload: CurrentCustomerPayload) {
    const orgId = payload.organizationId;
    const custId = payload.customerId;

    const [openOrdersCount, deliveredThisMonth, outstanding, recentOrders, upcoming, unread] =
      await Promise.all([
        this.prisma.order.count({
          where: {
            organizationId: orgId,
            customerId: custId,
            status: { in: ["PENDING", "ASSIGNED", "PICKED_UP", "IN_TRANSIT"] },
          },
        }),
        this.prisma.order.count({
          where: {
            organizationId: orgId,
            customerId: custId,
            status: "DELIVERED",
            deliveredAt: {
              gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
            },
          },
        }),
        this.getOutstandingSummary(orgId, custId),
        this.orders.list(orgId, {
          page: 1,
          limit: 5,
          sortBy: "createdAt",
          sortOrder: "desc",
          customerId: custId,
        }),
        this.prisma.order.findMany({
          where: {
            organizationId: orgId,
            customerId: custId,
            status: { notIn: ["DELIVERED", "CANCELLED"] },
            deliveryDate: { gte: new Date() },
          },
          orderBy: { deliveryDate: "asc" },
          take: 5,
        }),
        this.notifications.unreadCount(payload),
      ]);

    return {
      openOrdersCount,
      deliveredThisMonth,
      // Serialized as decimal STRINGs, not JS numbers — see
      // CustomerProfileService.getProfile's identical fix and
      // Customer.creditLimit's schema comment for why. The originally
      // recovered version accumulated Number(inv.balanceDue) in a loop.
      outstandingBalance: outstanding.balance,
      outstandingInvoiceCount: outstanding.count,
      recentOrders: recentOrders.items ?? [],
      upcomingDeliveries: upcoming,
      unreadNotificationCount: unread.unreadCount,
    };
  }

  /// Sums `balanceDue` in the database via Prisma's `aggregate` rather than
  /// pulling up to 1,000 invoice rows into the Node process to add them up in
  /// a loop — the fix for the originally recovered version, which did exactly
  /// that. `_sum` returns `null` when there are zero matching rows (not `0`),
  /// so that case is handled explicitly.
  private async getOutstandingSummary(
    organizationId: string,
    customerId: string,
  ): Promise<{ balance: string; count: number }> {
    const where: Prisma.InvoiceWhereInput = {
      organizationId,
      customerId,
      status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] },
    };

    const [aggregate, count] = await Promise.all([
      this.prisma.invoice.aggregate({ where, _sum: { balanceDue: true } }),
      this.prisma.invoice.count({ where }),
    ]);

    return { balance: (aggregate._sum.balanceDue ?? new Prisma.Decimal(0)).toString(), count };
  }
}
