import { Test, TestingModule } from "@nestjs/testing";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { asDependency } from "../test-support/portal-spec.helpers";
import { CustomerPaymentsService } from "./customer-payments.service";

function makePrisma() {
  return {
    payment: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      aggregate: jest.fn(),
    },
    invoice: {
      aggregate: jest.fn(),
      count: jest.fn(),
    },
  };
}

describe("CustomerPaymentsService", () => {
  let svc: CustomerPaymentsService;
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
      providers: [CustomerPaymentsService, { provide: PrismaService, useValue: asDependency<PrismaService>(prisma) }],
    }).compile();

    svc = module.get(CustomerPaymentsService);
  });

  it("lists payments scoped to the customer's invoices only", async () => {
    prisma.payment.findMany.mockResolvedValue([
      {
        id: "pay-1",
        amount: new Prisma.Decimal("100.00"),
        currency: "USD",
        method: "BANK_TRANSFER",
        paymentDate: new Date("2026-01-05"),
        reference: null,
        invoice: { id: "inv-1", invoiceNumber: "INV-1" },
      },
    ]);

    const result = await svc.list(payload);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].amount).toBe("100");
    expect(prisma.payment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: "org-1",
          invoice: { customerId: "cust-1" },
        },
      }),
    );
  });

  it("summary aggregates outstanding, paidThisMonth, overdueCount", async () => {
    prisma.invoice.aggregate.mockResolvedValue({ _sum: { balanceDue: new Prisma.Decimal("50") } });
    prisma.invoice.count.mockResolvedValue(2);
    prisma.payment.aggregate.mockResolvedValue({ _sum: { amount: new Prisma.Decimal("25") } });
    prisma.payment.findFirst.mockResolvedValue(null);

    const result = await svc.summary(payload);
    expect(result.outstandingBalance).toBe("50");
    expect(result.paidThisMonth).toBe("25");
    expect(result.overdueCount).toBe(2);
    expect(result.lastPayment).toBeNull();
  });
});
