import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { OrdersService } from "../../orders/orders.service";
import type { CurrentCustomerPayload } from "../auth/interfaces/current-customer.interface";
import type { ListOrdersQueryDto } from "../../orders/dto/list-orders-query.dto";

/// Delivery-proof viewing (an original design goal for this service — see
/// docs/CUSTOMER_PORTAL_API.md's "Known limitations") is intentionally not
/// wired here: the Delivery Proof module (model, service, storage) is not
/// present in this repository. Rather than fake the endpoint or query a
/// table that doesn't exist, the capability is omitted outright until
/// Delivery Proof is recovered/rebuilt — at which point this service is the
/// natural place to reintroduce `getDeliveryProof`/`getDeliveryProofFile`,
/// scoped exactly like every other method here.
@Injectable()
export class CustomerOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
  ) {}

  async list(payload: CurrentCustomerPayload, query: ListOrdersQueryDto) {
    return this.orders.list(payload.organizationId, {
      ...query,
      customerId: payload.customerId,
    });
  }

  async getById(payload: CurrentCustomerPayload, id: string) {
    const order = await this.orders.getById(payload.organizationId, id);
    this.assertOwned(order, payload);
    return order;
  }

  async getTimeline(payload: CurrentCustomerPayload, id: string) {
    const order = await this.orders.getById(payload.organizationId, id);
    this.assertOwned(order, payload);
    return this.prisma.orderStatusHistory.findMany({
      where: { orderId: id },
      orderBy: { createdAt: "asc" },
    });
  }

  /// A customer's own order that belongs to another customer in the same
  /// organization returns 404, identically to an order that doesn't exist at
  /// all — never 403, which would let a customer enumerate valid order ids
  /// belonging to other customers just by noting which response code comes
  /// back. Every cross-customer scope check in this module follows the same
  /// rule.
  private assertOwned(order: { customerId: string }, payload: CurrentCustomerPayload): void {
    if (order.customerId !== payload.customerId) {
      throw new NotFoundException("Order not found");
    }
  }
}
