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

  /// A read-only aggregation, safe for the broadest set of finance-adjacent
  /// roles (including DISPATCHER, whose only finance access is this
  /// endpoint). `estimatedGrossProfit` here is an org-wide figure — money
  /// actually collected minus approved costs — distinct from
  /// orderProfitability's per-order figure below, which uses the order's
  /// agreed price as revenue rather than what's actually been collected.
  async summary(organizationId: string) {
    await this.invoicesService.refreshOverdueInvoices(organizationId);

    const [invoiceAgg, overdueAgg, pendingExpenseCount, approvedExpenseAgg] = await Promise.all([
      this.prisma.invoice.aggregate({
        where: { organizationId, status: { not: "CANCELLED" } },
        _count: { _all: true },
        _sum: { totalAmount: true, paidAmount: true, balanceDue: true },
      }),
      this.prisma.invoice.aggregate({
        where: { organizationId, status: "OVERDUE" },
        _count: { _all: true },
        _sum: { balanceDue: true },
      }),
      this.prisma.expense.count({ where: { organizationId, status: "PENDING" } }),
      this.prisma.expense.aggregate({
        where: { organizationId, status: "APPROVED" },
        _sum: { amount: true },
      }),
    ]);

    const totalCollected = invoiceAgg._sum.paidAmount ?? new Prisma.Decimal(0);
    const approvedExpensesTotal = approvedExpenseAgg._sum.amount ?? new Prisma.Decimal(0);

    return {
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
      /// = total collected across all non-cancelled invoices - total
      /// APPROVED expenses org-wide. A coarse profitability signal, not a
      /// substitute for real accounting (no COGS/overhead/tax modeling).
      estimatedGrossProfit: totalCollected.sub(approvedExpensesTotal).toString(),
    };
  }

  /// Order Revenue = order.price (the agreed price, not what's actually
  /// been collected — see the docstring on `summary` for how this differs
  /// from the org-wide figure). Approved Expenses = sum of this order's
  /// APPROVED expenses only; PENDING/REJECTED never count, per the phase
  /// spec ("only APPROVED expenses count toward profitability").
  async orderProfitability(organizationId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({ where: { id: orderId, organizationId } });
    if (!order) {
      throw new NotFoundException("Order not found");
    }

    const approvedExpenseAgg = await this.prisma.expense.aggregate({
      where: { organizationId, orderId, status: "APPROVED" },
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
}
