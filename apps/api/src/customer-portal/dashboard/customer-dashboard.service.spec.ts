import { Test, TestingModule } from "@nestjs/testing";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { OrdersService } from "../../orders/orders.service";
import { InvoicesService } from "../../invoices/invoices.service";
import { CustomerNotificationsService } from "../notifications/customer-notifications.service";
import { asDependency } from "../test-support/portal-spec.helpers";
import { CustomerDashboardService } from "./customer-dashboard.service";

function makePrisma() {
  return {
    order: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
    invoice: {
      aggregate: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
    payment: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null } }),
    },
  };
}

function makeOrdersService() {
  return { list: jest.fn().mockResolvedValue({ items: [] }) };
}

function makeNotificationsService() {
  return { unreadCount: jest.fn().mockResolvedValue({ unreadCount: 0 }) };
}

describe("CustomerDashboardService", () => {
  let svc: CustomerDashboardService;
  let prisma: ReturnType<typeof makePrisma>;
  let orders: ReturnType<typeof makeOrdersService>;
  let notifications: ReturnType<typeof makeNotificationsService>;

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
    notifications = makeNotificationsService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomerDashboardService,
        { provide: PrismaService, useValue: asDependency<PrismaService>(prisma) },
        { provide: OrdersService, useValue: asDependency<OrdersService>(orders) },
        { provide: InvoicesService, useValue: asDependency<InvoicesService>({}) },
        { provide: CustomerNotificationsService, useValue: asDependency<CustomerNotificationsService>(notifications) },
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
    expect(result.paymentsThisMonth).toBe("0");
  });

  it("returns a zero balance string when there are no outstanding invoices", async () => {
    prisma.invoice.aggregate.mockResolvedValue({ _sum: { balanceDue: null } });
    prisma.invoice.count.mockResolvedValue(0);

    const result = await svc.getDashboard(payload);

    expect(result.outstandingBalance).toBe("0");
    expect(result.outstandingInvoiceCount).toBe(0);
  });
});
