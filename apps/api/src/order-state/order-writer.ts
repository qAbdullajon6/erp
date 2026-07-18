import { Injectable, NotFoundException } from "@nestjs/common";
import { Order, OrderStatus, Prisma } from "@prisma/client";
import type { CurrentUserPayload } from "../auth/interfaces/current-user.interface";
import { projectOrderStatus } from "./projection.policy";
import { planCommercialTransition } from "./transition.policy";

/// OrderWriter — the persistence arm of ProjectionPolicy and TransitionPolicy.
///
/// Satisfies AR5 literally: this is the ONLY code in the codebase permitted to
/// write Order.status, Order.driverId, Order.vehicleId, Order.deliveredAt,
/// Order.cancelledAt, or an OrderStatusHistory row. The policies decide; this
/// executes. Nothing else may touch those columns — if you are reaching for
/// `prisma.order.update` to change a status, you are in the wrong file.
///
/// Satisfies AR2: every method takes the CALLER'S transaction client. It never
/// opens a transaction of its own, so an order projection and the dispatch write
/// that caused it commit as one fact or not at all. It is impossible to use this
/// class outside a transaction, which is the point.
///
/// Implements R3, R4, R6, R7, R8.
@Injectable()
export class OrderWriter {
  /// Re-derives the order from its dispatches and persists the result (R3).
  ///
  /// Idempotent by construction: the projection reports `changed: false` when the
  /// order already agrees with its dispatches, and nothing is written. Callers may
  /// therefore project as often as they like — including twice in one flow — and
  /// the backfill relies on exactly this.
  async project(
    tx: Prisma.TransactionClient,
    organizationId: string,
    orderId: string,
    actor: CurrentUserPayload,
    note?: string,
  ): Promise<Order> {
    const order = await tx.order.findFirst({ where: { id: orderId, organizationId } });
    if (!order) {
      throw new NotFoundException("Order not found");
    }

    // Read inside the caller's transaction, so the dispatch write that triggered
    // this projection is already visible to it.
    const dispatches = await tx.dispatch.findMany({
      where: { orderId, organizationId },
      select: { status: true, driverId: true, vehicleId: true, deliveryDateActual: true },
    });

    const projection = projectOrderStatus(order, dispatches);
    if (!projection.changed) {
      return order;
    }

    const updated = await tx.order.update({
      where: { id: orderId },
      data: {
        status: projection.status,
        driverId: projection.driverId,
        vehicleId: projection.vehicleId,
        deliveredAt: projection.deliveredAt,
      },
    });

    await this.appendHistory(tx, organizationId, orderId, projection.historyToAppend, actor, note);

    return updated;
  }

  /// Applies a commercial transition — approval or cancellation (R4).
  async applyCommercial(
    tx: Prisma.TransactionClient,
    organizationId: string,
    order: Order,
    target: OrderStatus,
    actor: CurrentUserPayload,
    note?: string,
  ): Promise<Order> {
    const plan = planCommercialTransition(order.status, target, new Date());

    // Compare-and-set on the status the policy validated against: a concurrent
    // request must not have moved the order out from under us (the same R13
    // treatment the dispatch writes got in Task 8.3).
    const result = await tx.order.updateMany({
      where: { id: order.id, organizationId, status: order.status },
      data: {
        status: plan.status,
        cancelledAt: plan.cancelledAt,
        // Cleared on cancellation: a dead order projects nobody.
        driverId: plan.driverId,
        vehicleId: plan.vehicleId,
      },
    });
    if (result.count !== 1) {
      const current = await tx.order.findFirst({ where: { id: order.id, organizationId } });
      if (!current) throw new NotFoundException("Order not found");
      // Re-run the policy against what is actually there; it produces the right
      // 409 for the state we really lost to.
      planCommercialTransition(current.status, target, new Date());
    }

    await this.appendHistory(tx, organizationId, order.id, [plan.status], actor, note);

    return tx.order.findFirstOrThrow({ where: { id: order.id, organizationId } });
  }

  /// The opening history row of a newly created order. An order is BORN in DRAFT;
  /// that is not a transition, so no policy governs it — but the row still goes
  /// through this class, because OrderStatusHistory has exactly one writer (AR5).
  async recordCreated(
    tx: Prisma.TransactionClient,
    organizationId: string,
    orderId: string,
    actor: CurrentUserPayload,
  ): Promise<void> {
    await this.appendHistory(tx, organizationId, orderId, ["DRAFT"], actor, "Order created");
  }

  /// The only writer of OrderStatusHistory. Rows are appended oldest-first, so a
  /// projection that crossed several states records each of them (AR2 — one
  /// transaction, so a status change can never exist without its history).
  private async appendHistory(
    tx: Prisma.TransactionClient,
    organizationId: string,
    orderId: string,
    statuses: OrderStatus[],
    actor: CurrentUserPayload,
    note?: string,
  ): Promise<void> {
    for (const status of statuses) {
      await tx.orderStatusHistory.create({
        data: { organizationId, orderId, status, changedByUserId: actor.userId, note },
      });
    }
  }
}
