import { NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { InvoicesService } from "../../invoices/invoices.service";
import { PrismaService } from "../../prisma/prisma.service";
import { ListInvoicesQueryDto } from "../../invoices/dto/list-invoices-query.dto";
import { asDependency, firstMockArg } from "../test-support/portal-spec.helpers";
import { CustomerInvoicesService } from "./customer-invoices.service";

function makeInvoicesService() {
  return {
    getById: jest.fn(),
    refreshOverdueInvoices: jest.fn().mockResolvedValue(undefined),
    toResponse: jest.fn(<T>(row: T) => row),
  };
}

function makePrisma() {
  return {
    invoice: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
  };
}

describe("CustomerInvoicesService", () => {
  let svc: CustomerInvoicesService;
  let invoices: ReturnType<typeof makeInvoicesService>;
  let prisma: ReturnType<typeof makePrisma>;

  const payload = {
    accountId: "acc-1",
    customerId: "cust-1",
    organizationId: "org-1",
    email: "",
    companyName: "",
  };

  beforeEach(async () => {
    invoices = makeInvoicesService();
    prisma = makePrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomerInvoicesService,
        { provide: InvoicesService, useValue: asDependency<InvoicesService>(invoices) },
        { provide: PrismaService, useValue: asDependency<PrismaService>(prisma) },
      ],
    }).compile();

    svc = module.get(CustomerInvoicesService);
  });

  describe("getById", () => {
    it("returns invoice when owned by customer and portal-visible", async () => {
      invoices.getById.mockResolvedValue({ id: "inv-1", customerId: "cust-1", status: "SENT" });

      const result = await svc.getById(payload, "inv-1");
      expect(result.id).toBe("inv-1");
    });

    it("throws NotFound when invoice belongs to another customer", async () => {
      invoices.getById.mockResolvedValue({ id: "inv-1", customerId: "other-cust", status: "SENT" });

      await expect(svc.getById(payload, "inv-1")).rejects.toThrow(NotFoundException);
    });

    it("throws NotFound for DRAFT invoices (not portal-visible)", async () => {
      invoices.getById.mockResolvedValue({ id: "inv-1", customerId: "cust-1", status: "DRAFT" });

      await expect(svc.getById(payload, "inv-1")).rejects.toThrow(NotFoundException);
    });
  });

  describe("list", () => {
    it("scopes to the portal customer and excludes draft/cancelled by default", async () => {
      const query = new ListInvoicesQueryDto();
      query.customerId = "hacker";

      await svc.list(payload, query);

      expect(invoices.refreshOverdueInvoices).toHaveBeenCalledWith("org-1");
      expect(prisma.invoice.findMany).toHaveBeenCalled();
      const findManyArgs = firstMockArg<{
        where: { organizationId: string; customerId: string; status: { in: string[] } };
      }>(prisma.invoice.findMany);
      expect(findManyArgs.where).toMatchObject({
        organizationId: "org-1",
        customerId: "cust-1",
        status: { in: ["SENT", "PARTIALLY_PAID", "PAID", "OVERDUE"] },
      });
    });
  });
});
