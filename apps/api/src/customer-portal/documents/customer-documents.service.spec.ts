import { Test, TestingModule } from "@nestjs/testing";
import { PrismaService } from "../../prisma/prisma.service";
import { CustomerDocumentsService } from "./customer-documents.service";

describe("CustomerDocumentsService", () => {
  let svc: CustomerDocumentsService;
  let prisma: any;

  const payload = {
    accountId: "acc-1",
    customerId: "cust-1",
    organizationId: "org-1",
    email: "",
    companyName: "",
  };

  beforeEach(async () => {
    prisma = {
      invoice: { findMany: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [CustomerDocumentsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    svc = module.get(CustomerDocumentsService);
  });

  it("synthesizes a document per invoice, scoped to this customer", async () => {
    prisma.invoice.findMany.mockResolvedValue([
      { id: "inv-1", invoiceNumber: "INV-2026-0001", createdAt: new Date("2026-01-02T00:00:00.000Z") },
    ]);

    const result = await svc.list(payload);

    expect(result.items).toEqual([
      expect.objectContaining({
        id: "invoice:inv-1",
        type: "INVOICE",
        downloadUrl: "/api/customer-portal/invoices/inv-1",
      }),
    ]);
    expect(prisma.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: "org-1", customerId: "cust-1" } }),
    );
  });
});
