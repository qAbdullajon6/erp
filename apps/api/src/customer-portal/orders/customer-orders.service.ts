import { createReadStream, existsSync } from "fs";
import { join } from "path";
import { Injectable, NotFoundException, StreamableFile } from "@nestjs/common";
import type { OrderStatus } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { OrdersService } from "../../orders/orders.service";
import { TelematicsService } from "../../telematics/telematics.service";
import type { CurrentCustomerPayload } from "../auth/interfaces/current-customer.interface";
import type { ListOrdersQueryDto } from "../../orders/dto/list-orders-query.dto";
import {
  customerDispatchStatusLabel,
  customerOrderStatusLabel,
  customerSafeTimelineNote,
  customerShipmentStatusLabel,
} from "./customer-timeline.labels";

const PROOF_UPLOAD_ROOT = join(process.cwd(), "uploads", "driver-proofs");

/// DRAFT is pre-confirmation and staff-only (assertOwned rejects it too) —
/// the default status set whenever a customer doesn't filter explicitly.
const NON_DRAFT_ORDER_STATUSES: OrderStatus[] = [
  "PENDING",
  "ASSIGNED",
  "PICKED_UP",
  "IN_TRANSIT",
  "DELIVERED",
  "CANCELLED",
];

export interface CustomerDeliveryProofItem {
  id: string;
  type: string;
  fileName: string;
  mimeType: string;
  receiverName: string | null;
  receiverPhone: string | null;
  notes: string | null;
  odometerKm: string | null;
  createdAt: Date;
  downloadUrl: string;
}

export interface CustomerTimelineEvent {
  id: string;
  kind: "ORDER" | "DISPATCH";
  status: string;
  label: string;
  note: string | null;
  createdAt: Date;
}

export interface CustomerShipmentSummary {
  dispatchNumber: string;
  status: string | null;
  driverName: string;
  vehiclePlate: string | null;
  vehicleCode: string | null;
  eta: string | null;
}

@Injectable()
export class CustomerOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly telematics: TelematicsService,
  ) {}

  async list(payload: CurrentCustomerPayload, query: ListOrdersQueryDto) {
    // DRAFT orders are pre-confirmation and staff-only (see assertOwned) —
    // never surfaced to a customer, the same rule as DRAFT invoices.
    const requested = query.statuses?.length
      ? query.statuses
      : query.status
        ? [query.status]
        : NON_DRAFT_ORDER_STATUSES;
    const statuses = requested.filter((status) => status !== "DRAFT");

    if (statuses.length === 0) {
      // Every requested status was DRAFT — nothing a customer may ever see.
      return {
        items: [],
        meta: { page: query.page, limit: query.limit, total: 0, totalPages: 1 },
      };
    }

    return this.orders.list(payload.organizationId, {
      ...query,
      status: undefined,
      statuses,
      customerId: payload.customerId,
    });
  }

  async getById(payload: CurrentCustomerPayload, id: string) {
    const order = await this.orders.getById(payload.organizationId, id);
    this.assertOwned(order, payload);
    const shipment = await this.getShipmentSummary(payload.organizationId, id);
    return { ...order, shipment };
  }

  async getTimeline(payload: CurrentCustomerPayload, id: string): Promise<CustomerTimelineEvent[]> {
    const order = await this.orders.getById(payload.organizationId, id);
    this.assertOwned(order, payload);

    const [orderHistory, activeDispatch] = await Promise.all([
      this.prisma.orderStatusHistory.findMany({
        where: { orderId: id },
        orderBy: { createdAt: "asc" },
        select: { id: true, status: true, note: true, createdAt: true },
      }),
      this.prisma.dispatch.findFirst({
        where: {
          organizationId: payload.organizationId,
          orderId: id,
          status: { not: "CANCELLED" },
        },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          statusHistory: {
            orderBy: { createdAt: "asc" },
            select: { id: true, status: true, note: true, createdAt: true },
          },
        },
      }),
    ]);

    const events: CustomerTimelineEvent[] = [];

    for (const row of orderHistory) {
      const label = customerOrderStatusLabel(row.status);
      if (!label) continue;
      events.push({
        id: row.id,
        kind: "ORDER",
        status: row.status,
        label,
        note: customerSafeTimelineNote(row.note),
        createdAt: row.createdAt,
      });
    }

    if (activeDispatch?.statusHistory) {
      for (const row of activeDispatch.statusHistory) {
        const label = customerDispatchStatusLabel(row.status);
        if (!label) continue;
        events.push({
          id: row.id,
          kind: "DISPATCH",
          status: row.status,
          label,
          note: customerSafeTimelineNote(row.note),
          createdAt: row.createdAt,
        });
      }
    }

    events.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    return events;
  }

  /// Live location of the vehicle carrying this order, for the customer's
  /// tracking view. Ownership is checked exactly like getById — a foreign
  /// order 404s — before any position is revealed, and the payload carries no
  /// driver PII (see TelematicsService.trackForOrder).
  async getTracking(payload: CurrentCustomerPayload, id: string) {
    const order = await this.orders.getById(payload.organizationId, id);
    this.assertOwned(order, payload);
    return this.telematics.trackForOrder(payload.organizationId, id);
  }

  async getDeliveryProofs(
    payload: CurrentCustomerPayload,
    orderId: string,
  ): Promise<{ items: CustomerDeliveryProofItem[] }> {
    await this.assertOwnedOrderId(payload, orderId);

    const proofs = await this.prisma.dispatchDeliveryProof.findMany({
      where: {
        organizationId: payload.organizationId,
        OR: [{ orderId }, { dispatch: { orderId } }],
      },
      orderBy: { createdAt: "asc" },
    });

    const items = proofs
      .filter((p) => !(p.metadata as { metaOnly?: boolean } | null)?.metaOnly)
      .map((p) => ({
        id: p.id,
        type: p.type,
        fileName: p.fileName,
        mimeType: p.mimeType,
        receiverName: p.receiverName,
        receiverPhone: p.receiverPhone,
        notes: p.notes,
        odometerKm: p.odometerKm?.toString() ?? null,
        createdAt: p.createdAt,
        downloadUrl: `/api/customer-portal/orders/${orderId}/delivery-proof/${p.id}/file`,
      }));

    return { items };
  }

  async getDeliveryProofFile(
    payload: CurrentCustomerPayload,
    orderId: string,
    proofId: string,
  ): Promise<{ file: StreamableFile; mimeType: string; fileName: string }> {
    await this.assertOwnedOrderId(payload, orderId);

    const proof = await this.prisma.dispatchDeliveryProof.findFirst({
      where: {
        id: proofId,
        organizationId: payload.organizationId,
        OR: [{ orderId }, { dispatch: { orderId } }],
      },
    });

    if (!proof || (proof.metadata as { metaOnly?: boolean } | null)?.metaOnly) {
      throw new NotFoundException("Delivery proof not found");
    }

    const absolute = join(PROOF_UPLOAD_ROOT, proof.storagePath);
    if (!existsSync(absolute)) {
      throw new NotFoundException("Delivery proof file not found");
    }

    return {
      file: new StreamableFile(createReadStream(absolute)),
      mimeType: proof.mimeType,
      fileName: proof.fileName,
    };
  }

  private async getShipmentSummary(
    organizationId: string,
    orderId: string,
  ): Promise<CustomerShipmentSummary | null> {
    const dispatch = await this.prisma.dispatch.findFirst({
      where: { organizationId, orderId, status: { not: "CANCELLED" } },
      orderBy: { updatedAt: "desc" },
      select: {
        dispatchNumber: true,
        status: true,
        driver: { select: { firstName: true, lastName: true } },
        vehicle: { select: { plateNumber: true, vehicleCode: true } },
        routeStops: {
          take: 1,
          select: { plannedArrival: true },
        },
        deliveryDateScheduled: true,
      },
    });
    if (!dispatch) return null;

    const lastInitial = dispatch.driver.lastName?.trim()?.[0];
    const driverName =
      dispatch.driver.firstName?.trim()
        ? `${dispatch.driver.firstName.trim()}${lastInitial ? ` ${lastInitial}.` : ""}`
        : "Assigned driver";

    return {
      dispatchNumber: dispatch.dispatchNumber,
      status: customerShipmentStatusLabel(dispatch.status),
      driverName,
      vehiclePlate: dispatch.vehicle.plateNumber ?? null,
      vehicleCode: dispatch.vehicle.vehicleCode ?? null,
      eta: dispatch.routeStops[0]?.plannedArrival?.toISOString() ?? dispatch.deliveryDateScheduled?.toISOString() ?? null,
    };
  }

  private async assertOwnedOrderId(payload: CurrentCustomerPayload, orderId: string): Promise<void> {
    const order = await this.orders.getById(payload.organizationId, orderId);
    this.assertOwned(order, payload);
  }

  /// A customer's own order that belongs to another customer in the same
  /// organization returns 404, identically to an order that doesn't exist at
  /// all — never 403, which would let a customer enumerate valid order ids
  /// belonging to other customers just by noting which response code comes
  /// back. Every cross-customer scope check in this module follows the same
  /// rule.
  private assertOwned(
    order: { customerId: string; status: OrderStatus },
    payload: CurrentCustomerPayload,
  ): void {
    // DRAFT is pre-confirmation and staff-only — treated identically to an
    // order belonging to someone else: 404, not 403 (see the class comment
    // on assertOwnedOrderId's caller below for why 404 rather than 403).
    if (order.customerId !== payload.customerId || order.status === "DRAFT") {
      throw new NotFoundException("Order not found");
    }
  }
}
