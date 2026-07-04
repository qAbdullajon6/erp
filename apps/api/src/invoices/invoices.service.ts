import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Invoice, InvoiceLineItem, Payment, Prisma } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import type { CurrentUserPayload } from "../auth/interfaces/current-user.interface";
import { isValidEntityCode } from "../common/sequential-code.util";
import { PrismaService } from "../prisma/prisma.service";
import { CreateInvoiceDto } from "./dto/create-invoice.dto";
import { ListInvoicesQueryDto } from "./dto/list-invoices-query.dto";
import { UpdateInvoiceDto } from "./dto/update-invoice.dto";
import { generateUniqueInvoiceNumber } from "./invoice-number.util";

type InvoiceWithRelations = Invoice & { lineItems?: InvoiceLineItem[]; payments?: Payment[] };

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async list(organizationId: string, query: ListInvoicesQueryDto) {
    await this.refreshOverdueInvoices(organizationId);

    const where: Prisma.InvoiceWhereInput = {
      organizationId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.orderId ? { orderId: query.orderId } : {}),
      ...(query.issueDateFrom || query.issueDateTo
        ? {
            issueDate: {
              ...(query.issueDateFrom ? { gte: new Date(query.issueDateFrom) } : {}),
              ...(query.issueDateTo ? { lte: new Date(query.issueDateTo) } : {}),
            },
          }
        : {}),
      ...(query.search ? { invoiceNumber: { contains: query.search, mode: "insensitive" } } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.invoice.count({ where }),
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

  async getById(organizationId: string, id: string) {
    await this.refreshOverdueInvoices(organizationId);

    const invoice = await this.prisma.invoice.findFirst({
      where: { id, organizationId },
      include: {
        lineItems: { orderBy: { createdAt: "asc" } },
        payments: { orderBy: { paymentDate: "asc" } },
      },
    });
    if (!invoice) {
      throw new NotFoundException("Invoice not found");
    }
    return this.toResponse(invoice);
  }

  async create(organizationId: string, dto: CreateInvoiceDto, actor: CurrentUserPayload) {
    const customer = await this.prisma.customer.findFirst({ where: { id: dto.customerId, organizationId } });
    if (!customer) {
      throw new NotFoundException("Customer not found");
    }
    if (dto.orderId) {
      await this.assertOrderEligibleForInvoice(organizationId, dto.orderId);
    }

    const invoiceNumber = await this.resolveInvoiceNumberForCreate(organizationId, dto.invoiceNumber);
    const discountAmount = dto.discountAmount ?? 0;
    const taxAmount = dto.taxAmount ?? 0;
    const { lineItems, subtotal, totalAmount } = this.computeLineItemsAndTotals(
      dto.lineItems,
      discountAmount,
      taxAmount,
    );

    const invoice = await this.prisma.invoice.create({
      data: {
        organizationId,
        invoiceNumber,
        customerId: dto.customerId,
        orderId: dto.orderId,
        issueDate: dto.issueDate ? new Date(dto.issueDate) : undefined,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        currency: dto.currency ?? "USD",
        subtotal,
        discountAmount: new Prisma.Decimal(discountAmount),
        taxAmount: new Prisma.Decimal(taxAmount),
        totalAmount,
        paidAmount: new Prisma.Decimal(0),
        balanceDue: totalAmount,
        notes: dto.notes,
        lineItems: { create: lineItems.map((li) => ({ organizationId, ...li })) },
      },
      include: { lineItems: true },
    });

    await this.auditService.log({
      organizationId,
      actorUserId: actor.userId,
      action: "invoice.create",
      entityType: "Invoice",
      entityId: invoice.id,
      metadata: { invoiceNumber, totalAmount: totalAmount.toString() },
    });

    return this.toResponse(invoice);
  }

  async createFromOrder(organizationId: string, orderId: string, actor: CurrentUserPayload) {
    const order = await this.assertOrderEligibleForInvoice(organizationId, orderId);
    const invoiceNumber = await generateUniqueInvoiceNumber(this.prisma, organizationId);

    const { lineItems, subtotal, totalAmount } = this.computeLineItemsAndTotals(
      [{ description: `Order ${order.orderNumber}`, quantity: 1, unitPrice: order.price }],
      0,
      0,
    );

    const invoice = await this.prisma.invoice.create({
      data: {
        organizationId,
        invoiceNumber,
        customerId: order.customerId,
        orderId: order.id,
        currency: order.currency,
        subtotal,
        discountAmount: new Prisma.Decimal(0),
        taxAmount: new Prisma.Decimal(0),
        totalAmount,
        paidAmount: new Prisma.Decimal(0),
        balanceDue: totalAmount,
        lineItems: { create: lineItems.map((li) => ({ organizationId, ...li })) },
      },
      include: { lineItems: true },
    });

    await this.auditService.log({
      organizationId,
      actorUserId: actor.userId,
      action: "invoice.create_from_order",
      entityType: "Invoice",
      entityId: invoice.id,
      metadata: { orderId, invoiceNumber },
    });

    return this.toResponse(invoice);
  }

  async update(organizationId: string, id: string, dto: UpdateInvoiceDto, actor: CurrentUserPayload) {
    const existing = await this.prisma.invoice.findFirst({
      where: { id, organizationId },
      include: { lineItems: true },
    });
    if (!existing) {
      throw new NotFoundException("Invoice not found");
    }
    if (existing.status !== "DRAFT") {
      throw new ConflictException("Only DRAFT invoices can be edited — send or cancel it to move on");
    }

    if (dto.customerId && dto.customerId !== existing.customerId) {
      const customer = await this.prisma.customer.findFirst({ where: { id: dto.customerId, organizationId } });
      if (!customer) throw new NotFoundException("Customer not found");
    }
    if (dto.orderId && dto.orderId !== existing.orderId) {
      await this.assertOrderEligibleForInvoice(organizationId, dto.orderId, id);
    }
    if (dto.invoiceNumber && dto.invoiceNumber !== existing.invoiceNumber) {
      await this.assertInvoiceNumberAvailable(organizationId, dto.invoiceNumber);
    }

    const discountAmount = dto.discountAmount ?? Number(existing.discountAmount);
    const taxAmount = dto.taxAmount ?? Number(existing.taxAmount);

    let subtotal: Prisma.Decimal;
    let newLineItems: { description: string; quantity: Prisma.Decimal; unitPrice: Prisma.Decimal; lineTotal: Prisma.Decimal }[] | null = null;
    if (dto.lineItems) {
      const computed = this.computeLineItemsAndTotals(dto.lineItems, discountAmount, taxAmount);
      subtotal = computed.subtotal;
      newLineItems = computed.lineItems;
    } else {
      subtotal = existing.lineItems.reduce((sum, li) => sum.add(li.lineTotal), new Prisma.Decimal(0));
    }
    const totalAmount = subtotal.sub(discountAmount).add(taxAmount);
    const balanceDue = totalAmount.sub(existing.paidAmount);

    const updated = await this.prisma.$transaction(async (tx) => {
      if (newLineItems) {
        await tx.invoiceLineItem.deleteMany({ where: { invoiceId: id } });
        await tx.invoiceLineItem.createMany({
          data: newLineItems.map((li) => ({ organizationId, invoiceId: id, ...li })),
        });
      }
      return tx.invoice.update({
        where: { id },
        data: {
          invoiceNumber: dto.invoiceNumber,
          customerId: dto.customerId,
          orderId: dto.orderId,
          issueDate: dto.issueDate ? new Date(dto.issueDate) : undefined,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
          currency: dto.currency,
          subtotal,
          discountAmount: new Prisma.Decimal(discountAmount),
          taxAmount: new Prisma.Decimal(taxAmount),
          totalAmount,
          balanceDue,
          notes: dto.notes,
        },
        include: { lineItems: true },
      });
    });

    await this.auditService.log({
      organizationId,
      actorUserId: actor.userId,
      action: "invoice.update",
      entityType: "Invoice",
      entityId: id,
      metadata: { totalAmount: totalAmount.toString() },
    });

    return this.toResponse(updated);
  }

  async send(organizationId: string, id: string, actor: CurrentUserPayload) {
    const existing = await this.findOrThrow(organizationId, id);
    if (existing.status !== "DRAFT") {
      throw new ConflictException(`Only DRAFT invoices can be sent (this one is ${existing.status})`);
    }

    const invoice = await this.prisma.invoice.update({ where: { id }, data: { status: "SENT" } });

    await this.auditService.log({
      organizationId,
      actorUserId: actor.userId,
      action: "invoice.send",
      entityType: "Invoice",
      entityId: id,
    });

    return this.toResponse(invoice);
  }

  async cancel(organizationId: string, id: string, actor: CurrentUserPayload) {
    const existing = await this.findOrThrow(organizationId, id);
    if (existing.status === "PAID" || existing.status === "CANCELLED") {
      throw new ConflictException(`Cannot cancel an invoice with status ${existing.status}`);
    }

    const invoice = await this.prisma.invoice.update({
      where: { id },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });

    await this.auditService.log({
      organizationId,
      actorUserId: actor.userId,
      action: "invoice.cancel",
      entityType: "Invoice",
      entityId: id,
    });

    return this.toResponse(invoice);
  }

  /// Order eligibility for invoicing: must exist (org-scoped), must be
  /// DELIVERED, and must not already have another non-cancelled invoice
  /// (excluding `excludeInvoiceId`, used when re-validating an invoice
  /// being updated to point at a different order). Backed up by a partial
  /// unique DB index (see this phase's migration) that closes the race
  /// window between this check and the actual create.
  private async assertOrderEligibleForInvoice(
    organizationId: string,
    orderId: string,
    excludeInvoiceId?: string,
  ) {
    const order = await this.prisma.order.findFirst({ where: { id: orderId, organizationId } });
    if (!order) {
      throw new NotFoundException("Order not found");
    }
    if (order.status !== "DELIVERED") {
      throw new ConflictException("Only delivered orders can be invoiced");
    }

    const activeInvoice = await this.prisma.invoice.findFirst({
      where: {
        organizationId,
        orderId,
        status: { not: "CANCELLED" },
        ...(excludeInvoiceId ? { id: { not: excludeInvoiceId } } : {}),
      },
    });
    if (activeInvoice) {
      throw new ConflictException("This order already has an active invoice");
    }

    return order;
  }

  /// Lazy overdue recompute — there is no cron/background job in this
  /// phase, so a SENT/PARTIALLY_PAID invoice only actually flips to
  /// OVERDUE the next time it's read (list/getById), not the instant its
  /// due date passes. A single indexed UPDATE, cheap to run on every read.
  /// Never client-triggerable directly — status is never accepted from a
  /// PATCH body.
  /// Public so FinanceService can call it too before computing summary
  /// aggregates — the same lazy-refresh point, not duplicated logic.
  async refreshOverdueInvoices(organizationId: string): Promise<void> {
    await this.prisma.invoice.updateMany({
      where: {
        organizationId,
        status: { in: ["SENT", "PARTIALLY_PAID"] },
        dueDate: { lt: new Date() },
        balanceDue: { gt: 0 },
      },
      data: { status: "OVERDUE" },
    });
  }

  private computeLineItemsAndTotals(
    items: { description: string; quantity: number | Prisma.Decimal; unitPrice: number | Prisma.Decimal }[],
    discountAmount: number,
    taxAmount: number,
  ) {
    const lineItems = items.map((item) => {
      const quantity = new Prisma.Decimal(item.quantity);
      const unitPrice = new Prisma.Decimal(item.unitPrice);
      return { description: item.description, quantity, unitPrice, lineTotal: quantity.mul(unitPrice) };
    });
    const subtotal = lineItems.reduce((sum, li) => sum.add(li.lineTotal), new Prisma.Decimal(0));
    const totalAmount = subtotal.sub(discountAmount).add(taxAmount);
    return { lineItems, subtotal, totalAmount };
  }

  private async resolveInvoiceNumberForCreate(organizationId: string, requestedNumber?: string): Promise<string> {
    if (!requestedNumber) {
      return generateUniqueInvoiceNumber(this.prisma, organizationId);
    }
    await this.assertInvoiceNumberAvailable(organizationId, requestedNumber);
    return requestedNumber;
  }

  private async assertInvoiceNumberAvailable(organizationId: string, invoiceNumber: string): Promise<void> {
    if (!isValidEntityCode(invoiceNumber)) {
      throw new BadRequestException("invoiceNumber may only contain letters, numbers and hyphens");
    }
    const conflict = await this.prisma.invoice.findUnique({
      where: { organizationId_invoiceNumber: { organizationId, invoiceNumber } },
    });
    if (conflict) {
      throw new ConflictException("An invoice with this invoiceNumber already exists in this organization");
    }
  }

  /// Scoped by organizationId in the query itself, so an invoice id from
  /// another organization returns 404. Exported for PaymentsService.
  async findOrThrow(organizationId: string, id: string): Promise<Invoice> {
    const invoice = await this.prisma.invoice.findFirst({ where: { id, organizationId } });
    if (!invoice) {
      throw new NotFoundException("Invoice not found");
    }
    return invoice;
  }

  toResponse(invoice: InvoiceWithRelations) {
    return {
      id: invoice.id,
      organizationId: invoice.organizationId,
      invoiceNumber: invoice.invoiceNumber,
      customerId: invoice.customerId,
      orderId: invoice.orderId,
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      currency: invoice.currency,
      status: invoice.status,
      subtotal: invoice.subtotal.toString(),
      discountAmount: invoice.discountAmount.toString(),
      taxAmount: invoice.taxAmount.toString(),
      totalAmount: invoice.totalAmount.toString(),
      paidAmount: invoice.paidAmount.toString(),
      balanceDue: invoice.balanceDue.toString(),
      notes: invoice.notes,
      createdAt: invoice.createdAt,
      updatedAt: invoice.updatedAt,
      cancelledAt: invoice.cancelledAt,
      ...(invoice.lineItems
        ? {
            lineItems: invoice.lineItems.map((li) => ({
              id: li.id,
              description: li.description,
              quantity: li.quantity.toString(),
              unitPrice: li.unitPrice.toString(),
              lineTotal: li.lineTotal.toString(),
            })),
          }
        : {}),
      ...(invoice.payments
        ? {
            payments: invoice.payments.map((p) => ({
              id: p.id,
              paymentDate: p.paymentDate,
              amount: p.amount.toString(),
              currency: p.currency,
              method: p.method,
              reference: p.reference,
              notes: p.notes,
            })),
          }
        : {}),
    };
  }
}
