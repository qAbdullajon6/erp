import { Test, TestingModule } from "@nestjs/testing";
import { PrismaService } from "../../prisma/prisma.service";
import { CustomerNotificationsService } from "./customer-notifications.service";

describe("CustomerNotificationsService", () => {
  let svc: CustomerNotificationsService;
  let prisma: any;

  const payload = {
    accountId: "acc-1",
    customerId: "cust-1",
    organizationId: "org-1",
    email: "",
    companyName: "",
  };

  const orderRow = {
    id: "ord-1",
    orderNumber: "ORD-2026-0001",
    status: "IN_TRANSIT",
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  };
  const invoiceRow = {
    id: "inv-1",
    invoiceNumber: "INV-2026-0001",
    status: "OVERDUE",
    balanceDue: { toString: () => "500.00" },
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };

  beforeEach(async () => {
    prisma = {
      order: { findMany: jest.fn().mockResolvedValue([orderRow]) },
      invoice: { findMany: jest.fn().mockResolvedValue([invoiceRow]) },
      customerNotificationRead: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        upsert: jest.fn(),
        createMany: jest.fn(),
      },
      $executeRawUnsafe: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [CustomerNotificationsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    svc = module.get(CustomerNotificationsService);
  });

  it("builds a feed from orders and invoices, formatting the balance as a string", async () => {
    const result = await svc.list(payload);

    expect(result.items).toHaveLength(2);
    const invoiceItem = result.items.find((i) => i.type === "INVOICE");
    expect(invoiceItem?.message).toContain("500.00");
    expect(invoiceItem?.message).toContain("OVERDUE");
  });

  it("marks items read according to CustomerNotificationRead rows", async () => {
    prisma.customerNotificationRead.findMany.mockResolvedValue([{ key: "order:ord-1" }]);

    const result = await svc.list(payload);

    const order = result.items.find((i) => i.key === "order:ord-1");
    const invoice = result.items.find((i) => i.key === "invoice:inv-1");
    expect(order?.isRead).toBe(true);
    expect(invoice?.isRead).toBe(false);
  });

  describe("unreadCount", () => {
    it("computes the count from a database count query, not by re-fetching and filtering the full feed client-side", async () => {
      prisma.customerNotificationRead.count.mockResolvedValue(1);

      const result = await svc.unreadCount(payload);

      expect(result.unreadCount).toBe(1); // 2 items - 1 already read
      expect(prisma.customerNotificationRead.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ accountId: "acc-1" }) }),
      );
    });

    it("returns zero immediately when the feed is empty, without querying read-state at all", async () => {
      prisma.order.findMany.mockResolvedValue([]);
      prisma.invoice.findMany.mockResolvedValue([]);

      const result = await svc.unreadCount(payload);

      expect(result.unreadCount).toBe(0);
      expect(prisma.customerNotificationRead.count).not.toHaveBeenCalled();
    });
  });

  describe("markAllRead", () => {
    it("uses a parameterized createMany, never $executeRawUnsafe", async () => {
      // Regression coverage for the audit finding: the originally recovered
      // version built an `INSERT ... VALUES (...)` string via
      // $executeRawUnsafe with hand-escaped interpolated values — a
      // SQL-injection-shaped pattern regardless of today's inputs being
      // trusted UUIDs. This pins that the fix never touches raw SQL at all.
      await svc.markAllRead(payload);

      expect(prisma.customerNotificationRead.createMany).toHaveBeenCalledWith({
        data: [
          { accountId: "acc-1", key: "order:ord-1" },
          { accountId: "acc-1", key: "invoice:inv-1" },
        ],
        skipDuplicates: true,
      });
      expect(prisma.$executeRawUnsafe).not.toHaveBeenCalled();
    });

    it("does nothing when the feed is empty", async () => {
      prisma.order.findMany.mockResolvedValue([]);
      prisma.invoice.findMany.mockResolvedValue([]);

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
