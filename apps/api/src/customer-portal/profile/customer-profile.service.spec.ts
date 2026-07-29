import { Test, TestingModule } from "@nestjs/testing";
import { Prisma } from "@prisma/client";
import { AuditService } from "../../audit/audit.service";
import { PrismaService } from "../../prisma/prisma.service";
import { asDependency } from "../test-support/portal-spec.helpers";
import { CustomerProfileService } from "./customer-profile.service";

function makePrisma() {
  return {
    customer: { findUnique: jest.fn(), update: jest.fn() },
    customerPortalAccount: {
      findUnique: jest.fn().mockResolvedValue({
        notificationPreferences: null,
        language: "en",
        timezone: "UTC",
      }),
      update: jest.fn(),
    },
  };
}

function makeAuditService() {
  return { log: jest.fn().mockResolvedValue(undefined) };
}

describe("CustomerProfileService", () => {
  let svc: CustomerProfileService;
  let prisma: ReturnType<typeof makePrisma>;
  let audit: ReturnType<typeof makeAuditService>;

  const payload = {
    accountId: "acc-1",
    customerId: "cust-1",
    organizationId: "org-1",
    email: "",
    companyName: "",
  };

  beforeEach(async () => {
    prisma = makePrisma();
    audit = makeAuditService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomerProfileService,
        { provide: PrismaService, useValue: asDependency<PrismaService>(prisma) },
        { provide: AuditService, useValue: asDependency<AuditService>(audit) },
      ],
    }).compile();

    svc = module.get(CustomerProfileService);
  });

  describe("getProfile", () => {
    it("serializes creditLimit as a decimal STRING, not a JS number", async () => {
      prisma.customer.findUnique.mockResolvedValue({
        id: "cust-1",
        customerCode: "CUST-0001",
        companyName: "Acme Freight",
        contactName: "Jane",
        email: "jane@acme.test",
        phone: null,
        address: null,
        city: null,
        country: null,
        taxId: null,
        paymentTerms: "NET_30",
        creditLimit: new Prisma.Decimal("25000.50"),
        deliveryNotes: null,
      });

      const result = await svc.getProfile(payload);

      expect(result?.creditLimit).toBe("25000.5");
      expect(typeof result?.creditLimit).toBe("string");
      expect(result?.notificationPreferences.shipmentDelivered).toBe(true);
    });

    it("returns null when the customer record is missing", async () => {
      prisma.customer.findUnique.mockResolvedValue(null);

      expect(await svc.getProfile(payload)).toBeNull();
    });
  });

  describe("updateProfile", () => {
    it("updates only the provided fields and audit-logs the change", async () => {
      prisma.customer.update.mockResolvedValue({
        contactName: "New Name",
        phone: "+998900000000",
        address: null,
        city: null,
        country: null,
      });

      await svc.updateProfile(payload, { contactName: "New Name", phone: "+998900000000" });

      expect(prisma.customer.update).toHaveBeenCalledWith({
        where: { id: "cust-1", organizationId: "org-1" },
        data: { contactName: "New Name", phone: "+998900000000" },
      });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: "CUSTOMER_PORTAL_PROFILE_UPDATED" }),
      );
    });
  });
});
