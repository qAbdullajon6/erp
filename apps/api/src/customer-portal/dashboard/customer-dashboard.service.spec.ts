import { Test, TestingModule } from "@nestjs/testing";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { OrdersService } from "../../orders/orders.service";
import { InvoicesService } from "../../invoices/invoices.service";
import { CustomerNotificationsService } from "../notifications/customer-notifications.service";
import { CustomerDashboardService } from "./customer-dashboard.service";

describe("CustomerDashboardService", () => {
  let svc: CustomerDashboardService;
  let prisma: any;
  let orders: any;
  let notifications: any;

  const payload = {
    accountId: "acc-1",
    customerId: "cust-1",
    organizationId: "org-1",
    email: "",
    companyName: "",
  };

  beforeEach(async () => {
    prisma = {
      order: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
      invoice: {
        aggregate: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    orders = { list: jest.fn().mockResolvedValue({ items: [] }) };
    notifications = { unreadCount: jest.fn().mockResolvedValue({ unreadCount: 0 }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomerDashboardService,
        { provide: PrismaService, useValue: prisma },
        { provide: OrdersService, useValue: orders },
        { provide: InvoicesService, useValue: {} },
        { provide: CustomerNotificationsService, useValue: notifications },
      ],
    }).compile();

    svc = module.get(CustomerDashboardService);
  });

  it("computes outstandingBalance via a database SUM, serialized as a string", async () => {
    // Regression coverage for the audit finding: the originally recovered
    // version pulled up to 1,000 invoice rows into the Node process and
    // accumulated Number(inv.balanceDue) in a loop — both a memory-scan
    // performance issue and a floating-point-unsafe money representation.
    // This pins that the fix uses Prisma's aggregate (one SUM in Postgres)
    // and returns a decimal string.
    prisma.invoice.aggregate.mockResolvedValue({ _sum: { balanceDue: new Prisma.Decimal("1234.56") } });
    prisma.invoice.count.mockResolvedValue(3);

    const result = await svc.getDashboard(payload);

    expect(prisma.invoice.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ _sum: { balanceDue: true } }),
    );
    expect(result.outstandingBalance).toBe("1234.56");
    expect(typeof result.outstandingBalance).toBe("string");
    expect(result.outstandingInvoiceCount).toBe(3);
  });

  it("returns a zero balance string when there are no outstanding invoices", async () => {
    prisma.invoice.aggregate.mockResolvedValue({ _sum: { balanceDue: null } });
    prisma.invoice.count.mockResolvedValue(0);

    const result = await svc.getDashboard(payload);

    expect(result.outstandingBalance).toBe("0");
    expect(result.outstandingInvoiceCount).toBe(0);
  });
});
