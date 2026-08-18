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
});
