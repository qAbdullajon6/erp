import { Test, TestingModule } from "@nestjs/testing";
import { PrismaService } from "../../prisma/prisma.service";
import { asDependency, firstMockArg } from "../test-support/portal-spec.helpers";
import { CustomerNotificationsService } from "./customer-notifications.service";

function makePrisma() {
  const orderRow = {
    id: "ord-1",
    orderNumber: "ORD-2026-0001",
    status: "IN_TRANSIT",
    deliveryDate: new Date("2027-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  };
  const invoiceRow = {
    id: "inv-1",
    invoiceNumber: "INV-2026-0001",
    status: "OVERDUE",
    balanceDue: { toString: () => "500.00" },
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    createdAt: new Date("2025-12-01T00:00:00.000Z"),
  };

  return {
    order: { findMany: jest.fn().mockResolvedValue([orderRow]) },
    dispatch: { findMany: jest.fn().mockResolvedValue([]) },
    invoice: {
      findMany: jest
        .fn()
        .mockImplementation((args: { where?: { status?: unknown } }) => {
          const status = args?.where?.status;
          if (status === "PAID" || (status as { equals?: string })?.equals === "PAID") {
            return Promise.resolve([]);
          }
          return Promise.resolve([invoiceRow]);
        }),
    },
    customerPortalAccount: {
      findUnique: jest.fn().mockResolvedValue({ notificationPreferences: null }),
      update: jest.fn(),
    },
    customerNotificationRead: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      upsert: jest.fn(),
      createMany: jest.fn(),
    },
    $executeRawUnsafe: jest.fn(),
  };
}

describe("CustomerNotificationsService", () => {
  let svc: CustomerNotificationsService;
  let prisma: ReturnType<typeof makePrisma>;

  const payload = {
    accountId: "acc-1",
    customerId: "cust-1",
    organizationId: "org-1",
    email: "",
    companyName: "",
  };

  beforeEach(async () => {
    prisma = makePrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [CustomerNotificationsService, { provide: PrismaService, useValue: asDependency<PrismaService>(prisma) }],
    }).compile();

    svc = module.get(CustomerNotificationsService);
  });

  it("builds a feed from orders and invoices, formatting the balance as a string", async () => {
    const result = await svc.list(payload);

    expect(result.items.length).toBeGreaterThanOrEqual(2);
    const invoiceItem = result.items.find((i) => i.type === "INVOICE");
    expect(invoiceItem?.message).toContain("500.00");
    expect(invoiceItem?.message.toLowerCase()).toContain("overdue");
  });

  it("marks items read according to CustomerNotificationRead rows", async () => {
    prisma.customerNotificationRead.findMany.mockResolvedValue([{ key: "order:ord-1" }]);

    const result = await svc.list(payload);

    const order = result.items.find((i) => i.key === "order:ord-1");
    const invoice = result.items.find((i) => i.key === "invoice-overdue:inv-1");
    expect(order?.isRead).toBe(true);
    expect(invoice?.isRead).toBe(false);
  });

  it("filters feed items when notification preferences disable a category", async () => {
    prisma.customerPortalAccount.findUnique.mockResolvedValue({
      notificationPreferences: {
        shipmentAssigned: false,
        shipmentDelayed: true,
        shipmentDelivered: true,
        invoiceCreated: true,
        invoiceOverdue: false,
        paymentReceived: true,
        documentsAvailable: true,
      },
    });

    const result = await svc.list(payload);
    expect(result.items.find((i) => i.key === "order:ord-1")).toBeUndefined();
    expect(result.items.find((i) => i.key === "invoice-overdue:inv-1")).toBeUndefined();
  });

  describe("unreadCount", () => {
    it("computes the count from a database count query, not by re-fetching and filtering the full feed client-side", async () => {
      prisma.customerNotificationRead.count.mockResolvedValue(1);

      const result = await svc.unreadCount(payload);

      expect(result.unreadCount).toBe(1); // 2 items - 1 already read
      expect(prisma.customerNotificationRead.count).toHaveBeenCalled();
      const countArgs = firstMockArg<{ where: { accountId: string } }>(
        prisma.customerNotificationRead.count,
      );
      expect(countArgs.where.accountId).toBe("acc-1");
    });

    it("returns zero immediately when the feed is empty, without querying read-state at all", async () => {
      prisma.order.findMany.mockResolvedValue([]);
      prisma.invoice.findMany.mockImplementation(() => Promise.resolve([]));

      const result = await svc.unreadCount(payload);

      expect(result.unreadCount).toBe(0);
      expect(prisma.customerNotificationRead.count).not.toHaveBeenCalled();
    });
  });

  describe("markAllRead", () => {
    it("uses a parameterized createMany, never $executeRawUnsafe", async () => {
      await svc.markAllRead(payload);

      expect(prisma.customerNotificationRead.createMany).toHaveBeenCalled();
      const createManyArgs = firstMockArg<{
        data: { accountId: string; key: string }[];
        skipDuplicates: boolean;
      }>(prisma.customerNotificationRead.createMany);
      expect(createManyArgs.skipDuplicates).toBe(true);
      expect(createManyArgs.data).toEqual(
        expect.arrayContaining([
          { accountId: "acc-1", key: "order:ord-1" },
          { accountId: "acc-1", key: "invoice-overdue:inv-1" },
        ]),
      );
      expect(prisma.$executeRawUnsafe).not.toHaveBeenCalled();
    });

    it("does nothing when the feed is empty", async () => {
      prisma.order.findMany.mockResolvedValue([]);
      prisma.invoice.findMany.mockImplementation(() => Promise.resolve([]));

      await svc.markAllRead(payload);

      expect(prisma.customerNotificationRead.createMany).not.toHaveBeenCalled();
    });
  });

  describe("markRead", () => {
    it("upserts a single read row", async () => {
      await svc.markRead(payload, "order:ord-1");

      expect(prisma.customerNotificationRead.upsert).toHaveBeenCalledWith({
        where: { accountId_key: { accountId: "acc-1", key: "order:ord-1" } },
        create: { accountId: "acc-1", key: "order:ord-1" },
        update: {},
      });
    });
  });

  describe("DELIVERY_FAILED dispatch notifications", () => {
    it("generates a customer-safe shipmentFailed notification for each DELIVERY_FAILED dispatch", async () => {
      const failedAt = new Date("2026-02-10T14:00:00.000Z");
      prisma.dispatch.findMany.mockResolvedValue([
        {
          id: "dsp-fail-1",
          status: "DELIVERY_FAILED",
          updatedAt: new Date("2026-02-10T14:05:00.000Z"),
          failedAt,
          order: { id: "ord-1", orderNumber: "ORD-2026-0001" },
        },
      ]);
      // PENDING order after failure — status pulse suppressed
      prisma.order.findMany.mockResolvedValue([
        {
          id: "ord-1",
          orderNumber: "ORD-2026-0001",
          status: "PENDING",
          deliveryDate: new Date("2027-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-02-10T14:05:00.000Z"),
        },
      ]);

      const result = await svc.list(payload);
      const failureItem = result.items.find((i) => i.key === "dispatch-failed:dsp-fail-1");

      expect(failureItem).toBeDefined();
      expect(failureItem!.type).toBe("ORDER");
      expect(failureItem!.message).toMatch(/couldn't complete/i);
      // Customer-safe: no raw internal enum in the message
      expect(failureItem!.message).not.toContain("DELIVERY_FAILED");
      expect(failureItem!.message).not.toContain("CUSTOMER_UNAVAILABLE");
      expect(failureItem!.createdAt).toEqual(failedAt);
    });

    it("suppresses the generic status pulse for PENDING orders already covered by a failure notification", async () => {
      prisma.dispatch.findMany.mockResolvedValue([
        {
          id: "dsp-fail-2",
          status: "DELIVERY_FAILED",
          updatedAt: new Date("2026-02-15T10:00:00.000Z"),
          failedAt: null,
          order: { id: "ord-1", orderNumber: "ORD-2026-0001" },
        },
      ]);
      prisma.order.findMany.mockResolvedValue([
        {
          id: "ord-1",
          orderNumber: "ORD-2026-0001",
          status: "PENDING",
          deliveryDate: new Date("2027-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-02-15T10:00:00.000Z"),
        },
      ]);

      const result = await svc.list(payload);
      // Generic pulse key must not appear alongside the failure notification
      expect(result.items.find((i) => i.key === "order:ord-1")).toBeUndefined();
      expect(result.items.find((i) => i.key === "dispatch-failed:dsp-fail-2")).toBeDefined();
    });

    it("respects shipmentFailed preference — suppresses failure notification when disabled", async () => {
      prisma.customerPortalAccount.findUnique.mockResolvedValue({
        notificationPreferences: {
          shipmentAssigned: true,
          shipmentDelayed: true,
          shipmentDelivered: true,
          shipmentFailed: false,
          invoiceCreated: true,
          invoiceOverdue: true,
          paymentReceived: true,
          documentsAvailable: true,
        },
      });
      prisma.dispatch.findMany.mockResolvedValue([
        {
          id: "dsp-fail-3",
          status: "DELIVERY_FAILED",
          updatedAt: new Date("2026-02-20T08:00:00.000Z"),
          failedAt: null,
          order: { id: "ord-1", orderNumber: "ORD-2026-0001" },
        },
      ]);

      const result = await svc.list(payload);
      expect(result.items.find((i) => i.key === "dispatch-failed:dsp-fail-3")).toBeUndefined();
    });
  });

  describe("active dispatch status notifications", () => {
    const makeDispatch = (status: string, id = "dsp-1") => ({
      id,
      status,
      updatedAt: new Date("2026-03-01T09:00:00.000Z"),
      failedAt: null,
      order: { id: "ord-1", orderNumber: "ORD-2026-0001" },
    });

    it("generates dispatch-en-route notification for EN_ROUTE_TO_PICKUP dispatch", async () => {
      prisma.dispatch.findMany.mockResolvedValue([makeDispatch("EN_ROUTE_TO_PICKUP")]);
      const result = await svc.list(payload);
      const item = result.items.find((i) => i.key === "dispatch-en-route:dsp-1");
      expect(item).toBeDefined();
      expect(item!.message).toMatch(/on the way/i);
      expect(item!.type).toBe("ORDER");
    });

    it("generates dispatch-at-pickup notification for AT_PICKUP dispatch", async () => {
      prisma.dispatch.findMany.mockResolvedValue([makeDispatch("AT_PICKUP")]);
      const result = await svc.list(payload);
      const item = result.items.find((i) => i.key === "dispatch-at-pickup:dsp-1");
      expect(item).toBeDefined();
      expect(item!.message).toMatch(/pickup location/i);
    });

    it("generates dispatch-in-transit notification for IN_TRANSIT dispatch", async () => {
      prisma.dispatch.findMany.mockResolvedValue([makeDispatch("IN_TRANSIT")]);
      const result = await svc.list(payload);
      const item = result.items.find((i) => i.key === "dispatch-in-transit:dsp-1");
      expect(item).toBeDefined();
      expect(item!.message).toMatch(/on its way/i);
    });

    it("generates dispatch-arrived notification for ARRIVED_AT_DELIVERY dispatch", async () => {
      prisma.dispatch.findMany.mockResolvedValue([makeDispatch("ARRIVED_AT_DELIVERY")]);
      const result = await svc.list(payload);
      const item = result.items.find((i) => i.key === "dispatch-arrived:dsp-1");
      expect(item).toBeDefined();
      expect(item!.message).toMatch(/arrived at the delivery/i);
    });

    it("generates dispatch-cancelled notification for CANCELLED dispatch", async () => {
      prisma.dispatch.findMany.mockResolvedValue([makeDispatch("CANCELLED")]);
      const result = await svc.list(payload);
      const item = result.items.find((i) => i.key === "dispatch-cancelled:dsp-1");
      expect(item).toBeDefined();
      expect(item!.message).toMatch(/cancelled/i);
    });

    it("suppresses EN_ROUTE_TO_PICKUP notification when shipmentEnRoute preference is disabled", async () => {
      prisma.customerPortalAccount.findUnique.mockResolvedValue({
        notificationPreferences: { shipmentEnRoute: false },
      });
      prisma.dispatch.findMany.mockResolvedValue([makeDispatch("EN_ROUTE_TO_PICKUP")]);
      const result = await svc.list(payload);
      expect(result.items.find((i) => i.key === "dispatch-en-route:dsp-1")).toBeUndefined();
    });

    it("suppresses CANCELLED dispatch notification when shipmentCancelled preference is disabled", async () => {
      prisma.customerPortalAccount.findUnique.mockResolvedValue({
        notificationPreferences: { shipmentCancelled: false },
      });
      prisma.dispatch.findMany.mockResolvedValue([makeDispatch("CANCELLED")]);
      const result = await svc.list(payload);
      expect(result.items.find((i) => i.key === "dispatch-cancelled:dsp-1")).toBeUndefined();
    });

    it("each dispatch status produces a unique key so read-state is stable across status transitions", async () => {
      const statuses = ["EN_ROUTE_TO_PICKUP", "AT_PICKUP", "IN_TRANSIT", "ARRIVED_AT_DELIVERY", "CANCELLED"];
      const prefixes = ["dispatch-en-route", "dispatch-at-pickup", "dispatch-in-transit", "dispatch-arrived", "dispatch-cancelled"];
      for (let i = 0; i < statuses.length; i++) {
        prisma.dispatch.findMany.mockResolvedValue([makeDispatch(statuses[i])]);
        const result = await svc.list(payload);
        const key = `${prefixes[i]}:dsp-1`;
        expect(result.items.find((item) => item.key === key)).toBeDefined();
      }
    });
  });
});
