import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import type { CurrentCustomerPayload } from "../auth/interfaces/current-customer.interface";

export interface CustomerDocument {
  id: string;
  type: "INVOICE" | "POD";
  title: string;
  entityId: string;
  createdAt: Date;
  downloadUrl: string;
}

/// Synthesises a flat "documents" list from the customer's own data. This
/// provides a single download/file browser view without introducing a
/// separate documents table.
@Injectable()
export class CustomerDocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(payload: CurrentCustomerPayload): Promise<{ items: CustomerDocument[] }> {
    const [invoices, ordersWithProofs] = await Promise.all([
      this.prisma.invoice.findMany({
        where: { organizationId: payload.organizationId, customerId: payload.customerId },
        select: { id: true, invoiceNumber: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      this.prisma.order.findMany({
        where: {
          organizationId: payload.organizationId,
          customerId: payload.customerId,
          OR: [
            {
              dispatches: {
                some: {
                  deliveryProofs: {
                    some: {},
                  },
                },
              },
            },
          ],
        },
        select: {
          id: true,
          orderNumber: true,
          updatedAt: true,
          dispatches: {
            select: {
              deliveryProofs: {
                select: { id: true, createdAt: true, metadata: true },
                orderBy: { createdAt: "desc" },
                take: 20,
              },
            },
          },
        },
        take: 100,
      }),
    ]);

    const docs: CustomerDocument[] = invoices.map((inv) => ({
      id: `invoice:${inv.id}`,
      type: "INVOICE" as const,
      title: `Invoice #${inv.invoiceNumber}`,
      entityId: inv.id,
      createdAt: inv.createdAt,
      downloadUrl: `/api/customer-portal/invoices/${inv.id}`,
    }));

    for (const order of ordersWithProofs) {
      const proofs = order.dispatches.flatMap((d) => d.deliveryProofs);
      const visible = proofs.filter(
        (p) => !(p.metadata as { metaOnly?: boolean } | null)?.metaOnly,
      );
      if (visible.length === 0) continue;
      const latest = visible.reduce((a, b) => (a.createdAt > b.createdAt ? a : b));
      docs.push({
        id: `pod:${order.id}`,
        type: "POD",
        title: `POD — Order #${order.orderNumber}`,
        entityId: order.id,
        createdAt: latest.createdAt,
        downloadUrl: `/api/customer-portal/orders/${order.id}/delivery-proof`,
      });
    }

    docs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return { items: docs };
  }
}
