import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import type { CurrentCustomerPayload } from "../auth/interfaces/current-customer.interface";

export interface CustomerPaymentItem {
  id: string;
  amount: string;
  currency: string;
  method: string;
  paymentDate: Date;
  status: string | null;
  invoiceId: string;
  invoiceNumber: string;
  reference: string | null;
}

export interface CustomerPaymentsSummary {
  outstandingBalance: string;
  paidThisMonth: string;
  lastPayment: CustomerPaymentItem | null;
  overdueCount: number;
}

@Injectable()
export class CustomerPaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(payload: CurrentCustomerPayload): Promise<{ items: CustomerPaymentItem[] }> {
    const rows = await this.prisma.payment.findMany({
      where: {
        organizationId: payload.organizationId,
        invoice: { customerId: payload.customerId },
      },
      include: { invoice: { select: { id: true, invoiceNumber: true } } },
      orderBy: { paymentDate: "desc" },
      take: 200,
    });

    return { items: rows.map((row) => this.toItem(row)) };
  }

  async summary(payload: CurrentCustomerPayload): Promise<CustomerPaymentsSummary> {
    const orgId = payload.organizationId;
    const custId = payload.customerId;
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    const outstandingWhere: Prisma.InvoiceWhereInput = {
      organizationId: orgId,
      customerId: custId,
      status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] },
    };

    const [outstandingAgg, overdueCount, paidThisMonthAgg, lastPayment] = await Promise.all([
      this.prisma.invoice.aggregate({ where: outstandingWhere, _sum: { balanceDue: true } }),
      this.prisma.invoice.count({
        where: { organizationId: orgId, customerId: custId, status: "OVERDUE" },
      }),
      this.prisma.payment.aggregate({
        where: {
          organizationId: orgId,
          paymentDate: { gte: monthStart },
          invoice: { customerId: custId },
        },
        _sum: { amount: true },
      }),
      this.prisma.payment.findFirst({
        where: {
          organizationId: orgId,
          invoice: { customerId: custId },
        },
        include: { invoice: { select: { id: true, invoiceNumber: true } } },
        orderBy: { paymentDate: "desc" },
      }),
    ]);

    return {
      outstandingBalance: (outstandingAgg._sum.balanceDue ?? new Prisma.Decimal(0)).toString(),
      paidThisMonth: (paidThisMonthAgg._sum.amount ?? new Prisma.Decimal(0)).toString(),
      lastPayment: lastPayment ? this.toItem(lastPayment) : null,
      overdueCount,
    };
  }

  private toItem(row: {
    id: string;
    amount: Prisma.Decimal;
    currency: string;
    method: string;
    paymentDate: Date;
    reference: string | null;
    invoice: { id: string; invoiceNumber: string };
  }): CustomerPaymentItem {
    return {
      id: row.id,
      amount: row.amount.toString(),
      currency: row.currency,
      method: row.method,
      paymentDate: row.paymentDate,
      status: null,
      invoiceId: row.invoice.id,
      invoiceNumber: row.invoice.invoiceNumber,
      reference: row.reference,
    };
  }
}
