import { NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { OrdersService } from "../../orders/orders.service";
import { PrismaService } from "../../prisma/prisma.service";
import { TelematicsService } from "../../telematics/telematics.service";
import { CustomerOrdersService } from "./customer-orders.service";

describe("CustomerOrdersService", () => {
  let svc: CustomerOrdersService;
  let prisma: any;
  let orders: any;
  let telematics: any;

  const payload = {
    accountId: "acc-1",
    customerId: "cust-1",
    organizationId: "org-1",
    email: "",
    companyName: "",
  };

  beforeEach(async () => {
    prisma = {
      orderStatusHistory: { findMany: jest.fn() },
    };
    orders = { list: jest.fn(), getById: jest.fn() };
    telematics = { trackForOrder: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomerOrdersService,
        { provide: PrismaService, useValue: prisma },
        { provide: OrdersService, useValue: orders },
        { provide: TelematicsService, useValue: telematics },
      ],
    }).compile();

    svc = module.get(CustomerOrdersService);
  });

  describe("getById", () => {
    it("returns order when owned by customer", async () => {
      orders.getById.mockResolvedValue({ id: "ord-1", customerId: "cust-1" });

      const result = await svc.getById(payload, "ord-1");
      expect(result.id).toBe("ord-1");
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
    it("returns timeline for owned order", async () => {
      orders.getById.mockResolvedValue({ id: "ord-1", customerId: "cust-1" });
      prisma.orderStatusHistory.findMany.mockResolvedValue([{ id: "h1", status: "PENDING" }]);

      const result = await svc.getTimeline(payload, "ord-1");
      expect(result).toHaveLength(1);
    });

    it("throws NotFound when order is not owned", async () => {
      orders.getById.mockResolvedValue({ id: "ord-1", customerId: "other" });

      await expect(svc.getTimeline(payload, "ord-1")).rejects.toThrow(NotFoundException);
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

      await svc.list(payload, { page: 1, limit: 10, customerId: "hacker-cust" } as any);

      expect(orders.list).toHaveBeenCalledWith("org-1", expect.objectContaining({ customerId: "cust-1" }));
    });
  });
});
