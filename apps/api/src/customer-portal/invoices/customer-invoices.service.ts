import { Injectable, NotFoundException } from "@nestjs/common";
import { InvoiceStatus, Prisma } from "@prisma/client";
import { InvoicesService } from "../../invoices/invoices.service";
import type { CurrentCustomerPayload } from "../auth/interfaces/current-customer.interface";
import type { ListInvoicesQueryDto } from "../../invoices/dto/list-invoices-query.dto";
import { PrismaService } from "../../prisma/prisma.service";

/// Customers may only see invoices that have left draft / cancellation.
const PORTAL_VISIBLE: InvoiceStatus[] = ["SENT", "PARTIALLY_PAID", "PAID", "OVERDUE"];

@Injectable()
export class CustomerInvoicesService {
  constructor(
    private readonly invoices: InvoicesService,
    private readonly prisma: PrismaService,
  ) {}

  async list(payload: CurrentCustomerPayload, query: ListInvoicesQueryDto) {
    await this.invoices.refreshOverdueInvoices(payload.organizationId);

    const statusFilter =
      query.status && PORTAL_VISIBLE.includes(query.status)
        ? query.status
        : { in: PORTAL_VISIBLE };

    const where: Prisma.InvoiceWhereInput = {
      organizationId: payload.organizationId,
      customerId: payload.customerId,
      status: statusFilter,
      ...(query.orderId ? { orderId: query.orderId } : {}),
      ...(query.search
        ? {
            OR: [
              { invoiceNumber: { contains: query.search, mode: "insensitive" } },
              { notes: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const sortBy = query.sortBy ?? "createdAt";
    const sortOrder = query.sortOrder ?? "desc";

    const [rows, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        include: { lineItems: true, payments: { orderBy: { paymentDate: "asc" } } },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return {
      items: rows.map((row) => this.invoices.toResponse(row)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async getById(payload: CurrentCustomerPayload, id: string) {
    const invoice = await this.invoices.getById(payload.organizationId, id);
    this.assertOwned(invoice, payload);
    if (!PORTAL_VISIBLE.includes(invoice.status as InvoiceStatus)) {
      throw new NotFoundException("Invoice not found");
    }
    return invoice;
  }

  /// See CustomerOrdersService.assertOwned — 403 vs 404 is a distinguishable
  /// signal that lets a customer enumerate other customers' invoice ids;
  /// every cross-customer scope check in this module returns 404 for exactly
  /// this reason.
  private assertOwned(invoice: { customerId: string }, payload: CurrentCustomerPayload): void {
    if (invoice.customerId !== payload.customerId) {
      throw new NotFoundException("Invoice not found");
    }
  }
}
