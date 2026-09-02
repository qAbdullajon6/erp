import { NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

/// Shared "does this order exist in this org" guard — used by OrderNotesService
/// and OrderDocumentsService so both enforce identical tenant scoping through one
/// implementation instead of two hand-copied queries.
export async function assertOrderExists(
  prisma: PrismaService,
  organizationId: string,
  orderId: string,
): Promise<void> {
  const order = await prisma.order.findFirst({ where: { id: orderId, organizationId } });
  if (!order) {
    throw new NotFoundException("Order not found");
  }
}
