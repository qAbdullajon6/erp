import { NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { OrdersService } from "../../orders/orders.service";
import { PrismaService } from "../../prisma/prisma.service";
import { TelematicsService } from "../../telematics/telematics.service";
import { ListOrdersQueryDto } from "../../orders/dto/list-orders-query.dto";
import { asDependency } from "../test-support/portal-spec.helpers";
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
