import { NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { InvoicesService } from "../../invoices/invoices.service";
import { PrismaService } from "../../prisma/prisma.service";
import { CustomerInvoicesService } from "./customer-invoices.service";

describe("CustomerInvoicesService", () => {
  let svc: CustomerInvoicesService;
  let invoices: { getById: jest.Mock; refreshOverdueInvoices: jest.Mock; toResponse: jest.Mock };
  let prisma: { invoice: { findMany: jest.Mock; count: jest.Mock } };

  const payload = {
    accountId: "acc-1",
    customerId: "cust-1",
    organizationId: "org-1",
    email: "",
    companyName: "",
  };

  beforeEach(async () => {
    invoices = {
      getById: jest.fn(),
      refreshOverdueInvoices: jest.fn().mockResolvedValue(undefined),
      toResponse: jest.fn((row) => row),
    };
    prisma = {
      invoice: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomerInvoicesService,
        { provide: InvoicesService, useValue: invoices },
        { provide: PrismaService, useValue: prisma },
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
      await svc.list(payload, { customerId: "hacker" } as any);

      expect(invoices.refreshOverdueInvoices).toHaveBeenCalledWith("org-1");
      expect(prisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: "org-1",
            customerId: "cust-1",
            status: { in: ["SENT", "PARTIALLY_PAID", "PAID", "OVERDUE"] },
          }),
        }),
      );
    });
  });
});
