import { NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { InvoicesService } from "../../invoices/invoices.service";
import { CustomerInvoicesService } from "./customer-invoices.service";

describe("CustomerInvoicesService", () => {
  let svc: CustomerInvoicesService;
  let invoices: any;

  const payload = {
    accountId: "acc-1",
    customerId: "cust-1",
    organizationId: "org-1",
    email: "",
    companyName: "",
  };

  beforeEach(async () => {
    invoices = { list: jest.fn(), getById: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [CustomerInvoicesService, { provide: InvoicesService, useValue: invoices }],
    }).compile();

    svc = module.get(CustomerInvoicesService);
  });

  describe("getById", () => {
    it("returns invoice when owned by customer", async () => {
      invoices.getById.mockResolvedValue({ id: "inv-1", customerId: "cust-1" });

      const result = await svc.getById(payload, "inv-1");
      expect(result.id).toBe("inv-1");
    });

    it("throws NotFound (not Forbidden — avoids a 403-vs-404 enumeration oracle) when invoice belongs to another customer", async () => {
      invoices.getById.mockResolvedValue({ id: "inv-1", customerId: "other-cust" });

      await expect(svc.getById(payload, "inv-1")).rejects.toThrow(NotFoundException);
    });
  });

  describe("list", () => {
    it("delegates with forced customerId", async () => {
      invoices.list.mockResolvedValue({ items: [], meta: {} });

      await svc.list(payload, { customerId: "hacker" } as any);

      expect(invoices.list).toHaveBeenCalledWith("org-1", expect.objectContaining({ customerId: "cust-1" }));
    });
  });
});
