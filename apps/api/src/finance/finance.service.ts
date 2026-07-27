import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { InvoicesService } from "../invoices/invoices.service";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invoicesService: InvoicesService,
  ) {}

  /// Org-wide cash signal scoped to the organization's default currency.
  /// Mixing USD + UZS in a single sum is accountingly wrong, so other
  /// currencies are excluded and counted in `excludedOtherCurrencyCount`.
  async summary(organizationId: string) {
    await this.invoicesService.refreshOverdueInvoices(organizationId);

    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { defaultCurrency: true },
    });
    const currency = org?.defaultCurrency ?? "USD";

    const [invoiceAgg, overdueAgg, pendingExpenseCount, approvedExpenseAgg, otherInvoiceCount, otherExpenseCount] =
      await Promise.all([
        this.prisma.invoice.aggregate({
          where: { organizationId, currency, status: { not: "CANCELLED" } },
          _count: { _all: true },
          _sum: { totalAmount: true, paidAmount: true, balanceDue: true },
        }),
        this.prisma.invoice.aggregate({
          where: { organizationId, currency, status: "OVERDUE" },
          _count: { _all: true },
          _sum: { balanceDue: true },
        }),
        this.prisma.expense.count({ where: { organizationId, status: "PENDING" } }),
        this.prisma.expense.aggregate({
          where: { organizationId, currency, status: "APPROVED" },
          _sum: { amount: true },
        }),
        this.prisma.invoice.count({
          where: { organizationId, status: { not: "CANCELLED" }, currency: { not: currency } },
        }),
        this.prisma.expense.count({
          where: { organizationId, status: "APPROVED", currency: { not: currency } },
        }),
      ]);

    const totalCollected = invoiceAgg._sum.paidAmount ?? new Prisma.Decimal(0);
    const approvedExpensesTotal = approvedExpenseAgg._sum.amount ?? new Prisma.Decimal(0);
    const excludedOtherCurrencyCount = otherInvoiceCount + otherExpenseCount;

    return {
      currency,
      invoices: {
        count: invoiceAgg._count._all,
        totalInvoiced: (invoiceAgg._sum.totalAmount ?? new Prisma.Decimal(0)).toString(),
        totalCollected: totalCollected.toString(),
        totalOutstanding: (invoiceAgg._sum.balanceDue ?? new Prisma.Decimal(0)).toString(),
        overdueCount: overdueAgg._count._all,
        overdueAmount: (overdueAgg._sum.balanceDue ?? new Prisma.Decimal(0)).toString(),
      },
      expenses: {
        pendingCount: pendingExpenseCount,
        approvedTotal: approvedExpensesTotal.toString(),
      },
      estimatedGrossProfit: totalCollected.sub(approvedExpensesTotal).toString(),
      excludedOtherCurrencyCount,
    };
  }

  async orderProfitability(organizationId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({ where: { id: orderId, organizationId } });
    if (!order) {
      throw new NotFoundException("Order not found");
    }

    const approvedExpenseAgg = await this.prisma.expense.aggregate({
      where: { organizationId, orderId, status: "APPROVED", currency: order.currency },
      _sum: { amount: true },
    });
    const approvedExpenses = approvedExpenseAgg._sum.amount ?? new Prisma.Decimal(0);

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      currency: order.currency,
      revenue: order.price.toString(),
      approvedExpenses: approvedExpenses.toString(),
      estimatedGrossProfit: order.price.sub(approvedExpenses).toString(),
    };
  }

  /// Minimal fleet references for expense forms — ACCOUNTANT can write
  /// expenses but cannot call /drivers or /vehicles (FLEET_ROLES).
  async lookupDrivers(organizationId: string) {
    const rows = await this.prisma.driver.findMany({
      where: { organizationId, archivedAt: null },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: 200,
      select: { id: true, employeeCode: true, firstName: true, lastName: true },
    });
    return {
      items: rows.map((d) => ({
        id: d.id,
        code: d.employeeCode,
        label: `${d.firstName} ${d.lastName}`.trim(),
      })),
    };
  }

  async lookupVehicles(organizationId: string) {
    const rows = await this.prisma.vehicle.findMany({
      where: { organizationId, archivedAt: null },
      orderBy: { plateNumber: "asc" },
      take: 200,
      select: { id: true, vehicleCode: true, plateNumber: true },
    });
    return {
      items: rows.map((v) => ({
        id: v.id,
        code: v.vehicleCode,
        label: v.plateNumber,
      })),
    };
  }
}

