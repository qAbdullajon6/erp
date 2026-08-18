import { Test, TestingModule } from "@nestjs/testing";
import { PrismaService } from "../../prisma/prisma.service";
import { asDependency } from "../test-support/portal-spec.helpers";
import { CustomerDocumentsService } from "./customer-documents.service";

function makePrisma() {
  return {
    invoice: { findMany: jest.fn() },
    order: { findMany: jest.fn().mockResolvedValue([]) },
  };
}

describe("CustomerDocumentsService", () => {
  let svc: CustomerDocumentsService;
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
      providers: [CustomerDocumentsService, { provide: PrismaService, useValue: asDependency<PrismaService>(prisma) }],
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

  it("adds POD documents when non-meta proofs exist", async () => {
    prisma.invoice.findMany.mockResolvedValue([]);
    prisma.order.findMany.mockResolvedValue([
      {
        id: "ord-1",
        orderNumber: "ORD-1",
        updatedAt: new Date("2026-01-03"),
        dispatches: [
          {
            deliveryProofs: [
              {
                id: "p1",
                createdAt: new Date("2026-01-03"),
                metadata: null,
              },
            ],
          },
        ],
      },
    ]);

    const result = await svc.list(payload);
    expect(result.items).toEqual([
      expect.objectContaining({
        id: "pod:ord-1",
        type: "POD",
        title: "POD — Order #ORD-1",
      }),
    ]);
  });
});
