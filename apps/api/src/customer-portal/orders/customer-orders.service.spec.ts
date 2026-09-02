import { NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { OrdersService } from "../../orders/orders.service";
import { PrismaService } from "../../prisma/prisma.service";
import { TelematicsService } from "../../telematics/telematics.service";
import { ListOrdersQueryDto } from "../../orders/dto/list-orders-query.dto";
import { asDependency, firstMockArg } from "../test-support/portal-spec.helpers";
import { CustomerOrdersService } from "./customer-orders.service";

function makePrisma() {
  return {
    orderStatusHistory: { findMany: jest.fn() },
    dispatch: { findFirst: jest.fn().mockResolvedValue(null) },
    dispatchDeliveryProof: { findMany: jest.fn(), findFirst: jest.fn() },
  };
}

function makeOrdersService() {
  return { list: jest.fn(), getById: jest.fn() };
}

function makeTelematicsService() {
  return { trackForOrder: jest.fn() };
}

describe("CustomerOrdersService", () => {
  let svc: CustomerOrdersService;
  let prisma: ReturnType<typeof makePrisma>;
  let orders: ReturnType<typeof makeOrdersService>;
  let telematics: ReturnType<typeof makeTelematicsService>;

  const payload = {
    accountId: "acc-1",
    customerId: "cust-1",
    organizationId: "org-1",
    email: "",
    companyName: "",
  };

  beforeEach(async () => {
    prisma = makePrisma();
    orders = makeOrdersService();
    telematics = makeTelematicsService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomerOrdersService,
        { provide: PrismaService, useValue: asDependency<PrismaService>(prisma) },
        { provide: OrdersService, useValue: asDependency<OrdersService>(orders) },
        { provide: TelematicsService, useValue: asDependency<TelematicsService>(telematics) },
      ],
    }).compile();

    svc = module.get(CustomerOrdersService);
  });

  describe("getById", () => {
    it("returns order when owned by customer", async () => {
      orders.getById.mockResolvedValue({ id: "ord-1", customerId: "cust-1" });

      const result = await svc.getById(payload, "ord-1");
      expect(result.id).toBe("ord-1");
      expect(result.shipment).toBeNull();
    });

    it("throws NotFound (not Forbidden — avoids a 403-vs-404 enumeration oracle) when order belongs to another customer", async () => {
      orders.getById.mockResolvedValue({ id: "ord-1", customerId: "other-cust" });

      await expect(svc.getById(payload, "ord-1")).rejects.toThrow(NotFoundException);
    });

    it("throws NotFound when order does not exist", async () => {
      orders.getById.mockRejectedValue(new NotFoundException());

      await expect(svc.getById(payload, "ord-1")).rejects.toThrow(NotFoundException);
    });
  });

  describe("getTimeline", () => {
    it("returns customer-safe labeled timeline for owned order", async () => {
      orders.getById.mockResolvedValue({ id: "ord-1", customerId: "cust-1" });
      prisma.orderStatusHistory.findMany.mockResolvedValue([
        { id: "h0", status: "DRAFT", note: null, createdAt: new Date("2026-01-01") },
        { id: "h1", status: "PENDING", note: null, createdAt: new Date("2026-01-02") },
      ]);
      prisma.dispatch.findFirst.mockResolvedValue({
        id: "dsp-1",
        statusHistory: [
          {
            id: "d1",
            status: "EN_ROUTE_TO_PICKUP",
            note: "audit: internal",
            createdAt: new Date("2026-01-03"),
          },
        ],
      });

      const result = await svc.getTimeline(payload, "ord-1");
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ kind: "ORDER", label: "Pending" });
      expect(result[1]).toMatchObject({
        kind: "DISPATCH",
        label: "On the way to pickup",
        note: null,
      });
    });

    it("maps DELIVERY_FAILED dispatch status to 'Delivery attempted' and excludes DRAFT order status", async () => {
      orders.getById.mockResolvedValue({ id: "ord-1", customerId: "cust-1" });
      prisma.orderStatusHistory.findMany.mockResolvedValue([
        { id: "h0", status: "DRAFT", note: null, createdAt: new Date("2026-01-01") },
        { id: "h1", status: "PENDING", note: null, createdAt: new Date("2026-01-02") },
      ]);
      prisma.dispatch.findFirst.mockResolvedValue({
        id: "dsp-2",
        statusHistory: [
          { id: "ds1", status: "ASSIGNED", note: null, createdAt: new Date("2026-01-03") },
          { id: "ds2", status: "DELIVERY_FAILED", note: "audit: internal detail", createdAt: new Date("2026-01-04") },
        ],
      });

      const result = await svc.getTimeline(payload, "ord-1");
      // DRAFT order event is suppressed; ASSIGNED + DELIVERY_FAILED + PENDING shown
      expect(result).toHaveLength(3);
      const labels = result.map((e) => e.label);
      expect(labels).toContain("Pending");
      expect(labels).toContain("Assigned");
      expect(labels).toContain("Delivery attempted");
      // Internal enum value never leaks as a label
      expect(labels).not.toContain("DELIVERY_FAILED");
      // Internal audit note is stripped by customerSafeTimelineNote
      const failEvent = result.find((e) => e.label === "Delivery attempted")!;
      expect(failEvent.note).toBeNull();
    });

    it("selects the newest non-cancelled dispatch by updatedAt DESC so re-dispatch does not show stale failed history", async () => {
      orders.getById.mockResolvedValue({ id: "ord-1", customerId: "cust-1" });
      prisma.orderStatusHistory.findMany.mockResolvedValue([]);
      prisma.dispatch.findFirst.mockResolvedValue(null);

      await svc.getTimeline(payload, "ord-1");

      const args = firstMockArg<{ where: unknown; orderBy?: unknown }>(prisma.dispatch.findFirst);
      expect(args.orderBy).toEqual({ updatedAt: "desc" });
    });

    it("throws NotFound when order is not owned", async () => {
      orders.getById.mockResolvedValue({ id: "ord-1", customerId: "other" });

      await expect(svc.getTimeline(payload, "ord-1")).rejects.toThrow(NotFoundException);
    });
  });

  describe("getDeliveryProofs", () => {
    it("lists proofs for owned order without storagePath", async () => {
      orders.getById.mockResolvedValue({ id: "ord-1", customerId: "cust-1" });
      prisma.dispatchDeliveryProof.findMany.mockResolvedValue([
        {
          id: "p1",
          type: "PHOTO",
          fileName: "pod.jpg",
          mimeType: "image/jpeg",
          receiverName: "Sam",
          receiverPhone: null,
          notes: null,
          odometerKm: null,
          createdAt: new Date(),
          storagePath: "org/dsp/pod.jpg",
          metadata: null,
        },
        {
          id: "p2",
          type: "PHOTO",
          fileName: "pod-meta.json",
          mimeType: "application/json",
          receiverName: null,
          receiverPhone: null,
          notes: null,
          odometerKm: null,
          createdAt: new Date(),
          storagePath: "org/dsp/pod-meta.json",
          metadata: { metaOnly: true },
        },
      ]);

      const result = await svc.getDeliveryProofs(payload, "ord-1");
      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe("p1");
      expect("storagePath" in result.items[0]).toBe(false);
      expect(result.items[0].downloadUrl).toContain("/delivery-proof/p1/file");
    });

    it("404s when order is not owned", async () => {
      orders.getById.mockResolvedValue({ id: "ord-1", customerId: "other" });
      await expect(svc.getDeliveryProofs(payload, "ord-1")).rejects.toThrow(NotFoundException);
      expect(prisma.dispatchDeliveryProof.findMany).not.toHaveBeenCalled();
    });
  });

  describe("getDeliveryProofFile", () => {
    it("404s for foreign order before reading files", async () => {
      orders.getById.mockResolvedValue({ id: "ord-1", customerId: "other" });
      await expect(svc.getDeliveryProofFile(payload, "ord-1", "proof-1")).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.dispatchDeliveryProof.findFirst).not.toHaveBeenCalled();
    });

    it("404s when proof is missing", async () => {
      orders.getById.mockResolvedValue({ id: "ord-1", customerId: "cust-1" });
      prisma.dispatchDeliveryProof.findFirst.mockResolvedValue(null);
      await expect(svc.getDeliveryProofFile(payload, "ord-1", "proof-1")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("getTracking", () => {
    it("returns tracking for an owned order", async () => {
      orders.getById.mockResolvedValue({ id: "ord-1", customerId: "cust-1" });
      telematics.trackForOrder.mockResolvedValue({ orderId: "ord-1", status: "IN_TRANSIT", tracking: { latitude: 1, longitude: 2 } });

      const result = await svc.getTracking(payload, "ord-1");
      expect(result.tracking).toEqual({ latitude: 1, longitude: 2 });
      expect(telematics.trackForOrder).toHaveBeenCalledWith("org-1", "ord-1");
    });

    it("throws NotFound and never reveals a position for a foreign order", async () => {
      orders.getById.mockResolvedValue({ id: "ord-1", customerId: "other-cust" });

      await expect(svc.getTracking(payload, "ord-1")).rejects.toThrow(NotFoundException);
      expect(telematics.trackForOrder).not.toHaveBeenCalled();
    });
  });

  describe("getShipmentSummary status mapping", () => {
    function mockDispatch(
      status: string,
      routeStops: Array<{ plannedArrival: Date | null }> = [],
    ) {
      prisma.dispatch.findFirst.mockResolvedValue({
        dispatchNumber: "DSP-001",
        status,
        driver: { firstName: "Ali", lastName: "Khan" },
        vehicle: { plateNumber: "01 AAA01", vehicleCode: "VEH-001" },
        routeStops,
      });
    }

    beforeEach(() => {
      orders.getById.mockResolvedValue({ id: "ord-1", customerId: "cust-1" });
    });

    it("AT_STOP maps to 'In transit' — raw internal enum is never returned", async () => {
      mockDispatch("AT_STOP");
      const result = await svc.getById(payload, "ord-1");
      expect(result.shipment!.status).toBe("In transit");
      expect(result.shipment!.status).not.toBe("AT_STOP");
    });

    it("DELIVERY_FAILED maps to 'Delivery attempted' — raw internal enum is never returned", async () => {
      mockDispatch("DELIVERY_FAILED");
      const result = await svc.getById(payload, "ord-1");
      expect(result.shipment!.status).toBe("Delivery attempted");
      expect(result.shipment!.status).not.toBe("DELIVERY_FAILED");
    });

    it("EN_ROUTE_TO_PICKUP maps to customer-safe label", async () => {
      mockDispatch("EN_ROUTE_TO_PICKUP");
      const result = await svc.getById(payload, "ord-1");
      expect(result.shipment!.status).toBe("On the way to pickup");
      expect(result.shipment!.status).not.toBe("EN_ROUTE_TO_PICKUP");
    });

    it("AT_PICKUP maps to customer-safe label", async () => {
      mockDispatch("AT_PICKUP");
      const result = await svc.getById(payload, "ord-1");
      expect(result.shipment!.status).toBe("At pickup");
      expect(result.shipment!.status).not.toBe("AT_PICKUP");
    });

    it("ARRIVED_AT_DELIVERY maps to customer-safe label", async () => {
      mockDispatch("ARRIVED_AT_DELIVERY");
      const result = await svc.getById(payload, "ord-1");
      expect(result.shipment!.status).toBe("Arrived at destination");
      expect(result.shipment!.status).not.toBe("ARRIVED_AT_DELIVERY");
    });

    it("IN_TRANSIT maps to 'In transit'", async () => {
      mockDispatch("IN_TRANSIT");
      const result = await svc.getById(payload, "ord-1");
      expect(result.shipment!.status).toBe("In transit");
    });

    it("DELIVERED maps to 'Delivered'", async () => {
      mockDispatch("DELIVERED");
      const result = await svc.getById(payload, "ord-1");
      expect(result.shipment!.status).toBe("Delivered");
    });

    it("DRAFT maps to null — not exposed to customer", async () => {
      mockDispatch("DRAFT");
      const result = await svc.getById(payload, "ord-1");
      expect(result.shipment!.status).toBeNull();
    });

    it("returns eta as ISO string from linked routeStop.plannedArrival when available", async () => {
      const eta = new Date("2026-08-22T14:00:00.000Z");
      mockDispatch("IN_TRANSIT", [{ plannedArrival: eta }]);
      const result = await svc.getById(payload, "ord-1");
      expect(result.shipment!.eta).toBe(eta.toISOString());
    });

    it("returns eta: null when no routeStop is linked to the dispatch", async () => {
      mockDispatch("IN_TRANSIT", []);
      const result = await svc.getById(payload, "ord-1");
      expect(result.shipment!.eta).toBeNull();
    });

    it("returns eta: null when routeStop has no plannedArrival", async () => {
      mockDispatch("IN_TRANSIT", [{ plannedArrival: null }]);
      const result = await svc.getById(payload, "ord-1");
      expect(result.shipment!.eta).toBeNull();
    });
  });

  describe("list", () => {
    it("delegates to OrdersService with forced customerId, never trusting a client-supplied one", async () => {
      orders.list.mockResolvedValue({ items: [], meta: {} });

      const query = new ListOrdersQueryDto();
      query.page = 1;
      query.limit = 10;
      query.customerId = "hacker-cust";

      await svc.list(payload, query);

      expect(orders.list).toHaveBeenCalledWith("org-1", expect.objectContaining({ customerId: "cust-1" }));
    });
  });
});
