import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InvoiceStatus, Prisma } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import type { CurrentUserPayload } from "../auth/interfaces/current-user.interface";
import { InvoicesService } from "../invoices/invoices.service";
import { PrismaService } from "../prisma/prisma.service";
import { WorkflowEventService } from "../workflows/triggers/workflow-event.service";
import { CreatePaymentDto } from "./dto/create-payment.dto";
import { ListPaymentsQueryDto } from "./dto/list-payments-query.dto";

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly invoicesService: InvoicesService,
    private readonly workflowEvents: WorkflowEventService,
  ) {}

  async list(organizationId: string, query: ListPaymentsQueryDto) {
    const where: Prisma.PaymentWhereInput = {
      organizationId,
      ...(query.invoiceId ? { invoiceId: query.invoiceId } : {}),
      ...(query.method ? { method: query.method } : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            paymentDate: {
              ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
              ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
            },
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.payment.count({ where }),
    ]);

    return {
      items: rows.map((row) => this.toResponse(row)),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
      },
    };
  }

  async listForInvoice(organizationId: string, invoiceId: string) {
    await this.invoicesService.findOrThrow(organizationId, invoiceId);
    return this.list(organizationId, {
      page: 1,
      limit: 100,
      invoiceId,
      sortBy: "paymentDate",
      sortOrder: "asc",
    });
  }

  /// Records a payment and updates invoice paidAmount / balanceDue / status
  /// inside one Serializable transaction. Balance is recomputed from the
  /// payment ledger after insert so concurrent payments cannot both pass a
  /// stale balanceDue check and overwrite each other's totals.
  async record(organizationId: string, invoiceId: string, dto: CreatePaymentDto, actor: CurrentUserPayload) {
    const result = await this.prisma.$transaction(
      async (tx) => {
        const invoice = await tx.invoice.findFirst({ where: { id: invoiceId, organizationId } });
        if (!invoice) {
          throw new NotFoundException("Invoice not found");
        }

        if (invoice.status === "DRAFT" || invoice.status === "CANCELLED") {
          throw new ConflictException(
            `Cannot record a payment on an invoice with status ${invoice.status} — send it first`,
          );
        }

        const currency = dto.currency ?? invoice.currency;
        if (currency !== invoice.currency) {
          throw new BadRequestException(
            `Payment currency (${currency}) must match the invoice's currency (${invoice.currency}) — cross-currency payments aren't supported in this phase`,
          );
        }

        const amount = new Prisma.Decimal(dto.amount);
        if (amount.lte(0)) {
          throw new BadRequestException("Payment amount must be greater than 0");
        }

        const payment = await tx.payment.create({
          data: {
            organizationId,
            invoiceId,
            paymentDate: dto.paymentDate ? new Date(dto.paymentDate) : undefined,
            amount,
            currency,
            method: dto.method,
            reference: dto.reference,
            notes: dto.notes,
          },
        });

        const paidAgg = await tx.payment.aggregate({
          where: { organizationId, invoiceId },
          _sum: { amount: true },
        });
        const newPaidAmount = paidAgg._sum.amount ?? new Prisma.Decimal(0);
        if (newPaidAmount.gt(invoice.totalAmount)) {
          throw new BadRequestException(
            `Payment amount would exceed the invoice total (${invoice.totalAmount.toString()})`,
          );
        }

        const newBalanceDue = invoice.totalAmount.sub(newPaidAmount);
        let newStatus: InvoiceStatus;
        if (newBalanceDue.lte(0)) {
          newStatus = "PAID";
        } else if (invoice.dueDate && invoice.dueDate.getTime() < Date.now()) {
          newStatus = "OVERDUE";
        } else {
          newStatus = "PARTIALLY_PAID";
        }

        const updatedInvoice = await tx.invoice.update({
          where: { id: invoiceId },
          data: { paidAmount: newPaidAmount, balanceDue: newBalanceDue, status: newStatus },
        });

        return { payment, updatedInvoice, newStatus };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    await this.auditService.log({
      organizationId,
      actorUserId: actor.userId,
      action: "payment.record",
      entityType: "Payment",
      entityId: result.payment.id,
      metadata: {
        invoiceId,
        amount: result.payment.amount.toString(),
        resultingInvoiceStatus: result.newStatus,
      },
    });

    void this.workflowEvents.emit(organizationId, "payment.received", {
      id: result.payment.id,
      invoiceId,
      amount: result.payment.amount.toString(),
      resultingInvoiceStatus: result.newStatus,
    });
    if (result.newStatus === "PAID") {
      void this.workflowEvents.emit(organizationId, "invoice.paid", {
        id: invoiceId,
        invoiceNumber: result.updatedInvoice.invoiceNumber,
      });
    }

    return {
      payment: this.toResponse(result.payment),
      invoice: this.invoicesService.toResponse(result.updatedInvoice),
    };
  }

  private toResponse(payment: {
    id: string;
    organizationId: string;
    invoiceId: string;
    paymentDate: Date;
    amount: Prisma.Decimal;
    currency: string;
    method: string;
    reference: string | null;
    notes: string | null;
    createdAt: Date;
  }) {
    return {
      id: payment.id,
      organizationId: payment.organizationId,
      invoiceId: payment.invoiceId,
      paymentDate: payment.paymentDate,
      amount: payment.amount.toString(),
      currency: payment.currency,
      method: payment.method,
      reference: payment.reference,
      notes: payment.notes,
      createdAt: payment.createdAt,
    };
  }
}
