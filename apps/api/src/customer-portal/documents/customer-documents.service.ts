import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import type { CurrentCustomerPayload } from "../auth/interfaces/current-customer.interface";

export interface CustomerDocument {
  id: string;
  type: "INVOICE";
  title: string;
  entityId: string;
  createdAt: Date;
  downloadUrl: string;
}

/// Synthesises a flat "documents" list from the customer's own data. This
/// provides a single download/file browser view without introducing a
/// separate documents table.
///
/// Only invoices are represented today. Proof-of-delivery documents were part
/// of the original design (see docs/CUSTOMER_PORTAL_API.md's "Known
/// limitations") but the Delivery Proof module is not present in this
/// repository — there is no table to synthesize a POD document from, so
/// rather than reference one that doesn't exist, that document type is
/// omitted until Delivery Proof is recovered/rebuilt.
@Injectable()
export class CustomerDocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(payload: CurrentCustomerPayload): Promise<{ items: CustomerDocument[] }> {
    const invoices = await this.prisma.invoice.findMany({
      where: { organizationId: payload.organizationId, customerId: payload.customerId },
      select: { id: true, invoiceNumber: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    const docs: CustomerDocument[] = invoices.map((inv) => ({
      id: `invoice:${inv.id}`,
      type: "INVOICE",
      title: `Invoice #${inv.invoiceNumber}`,
      entityId: inv.id,
      createdAt: inv.createdAt,
      downloadUrl: `/api/customer-portal/invoices/${inv.id}`,
    }));

    return { items: docs };
  }
}
