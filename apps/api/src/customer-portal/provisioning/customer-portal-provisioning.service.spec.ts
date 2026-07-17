import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { AuditService } from "../../audit/audit.service";
import { MailService } from "../../mail/mail.service";
import { PasswordService } from "../../auth/password.service";
import { PrismaService } from "../../prisma/prisma.service";
import { CustomerPortalProvisioningService } from "./customer-portal-provisioning.service";
import {
  CustomerPortalAccountAlreadyExistsError,
  CustomerPortalCustomerInactiveError,
  CustomerPortalInvitationAlreadyExistsError,
  CustomerPortalInvitationExpiredError,
  CustomerPortalInvitationNotFoundError,
  CustomerPortalInvitationRevokedError,
} from "./customer-portal-invitation.errors";

describe("CustomerPortalProvisioningService", () => {
  let svc: CustomerPortalProvisioningService;
  let prisma: any;
  let mail: any;
  let audit: any;
  let passwordService: any;

  const customer = {
    email: "buyer@acme.test",
    companyName: "Acme Freight",
    status: "ACTIVE",
    portalAccount: null as { id: string } | null,
  };

  const openInvitation = {
    id: "inv-1",
    organizationId: "org-1",
    customerId: "cust-1",
    email: "buyer@acme.test",
    tokenHash: "hash",
    status: "PENDING",
    invitedByUserId: "user-1",
    expiresAt: new Date(Date.now() + 7 * 86_400_000),
    acceptedAt: null,
    revokedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    prisma = {
      customer: { findFirst: jest.fn(), findUnique: jest.fn() },
      organization: { findUnique: jest.fn() },
      customerPortalInvitation: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
      },
      customerPortalAccount: {
        create: jest.fn(),
        findFirst: jest.fn(),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn((cb) => cb(prisma)),
    };
    mail = {
      sendCustomerPortalInvitationEmail: jest.fn().mockResolvedValue(undefined),
      sendRawEmail: jest.fn().mockResolvedValue(undefined),
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    passwordService = { hash: jest.fn().mockResolvedValue("hashed-pw") };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomerPortalProvisioningService,
        { provide: PrismaService, useValue: prisma },
        { provide: MailService, useValue: mail },
        { provide: AuditService, useValue: audit },
        { provide: PasswordService, useValue: passwordService },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue({
              appPublicUrl: "https://app.flowerp.uz",
              expiresInDays: 7,
            }),
          },
        },
      ],
    }).compile();

    svc = module.get(CustomerPortalProvisioningService);
  });

  describe("createInvitation", () => {
    const input = {
      organizationId: "org-1",
      customerId: "cust-1",
      invitedByUserId: "user-1",
      organizationName: "FlowERP Test Logistics",
      inviterDisplayName: "Alex Admin",
    };

    it("creates a pending invitation and emails it", async () => {
      prisma.customer.findFirst.mockResolvedValue(customer);
      prisma.organization.findUnique.mockResolvedValue({ status: "ACTIVE" });
      prisma.customerPortalInvitation.findFirst.mockResolvedValue(null);
      prisma.customerPortalInvitation.create.mockResolvedValue(openInvitation);

      const result = await svc.createInvitation(input);

      expect(result.status).toBe("PENDING");
      expect(mail.sendCustomerPortalInvitationEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: "buyer@acme.test", organizationName: "FlowERP Test Logistics" }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: "CUSTOMER_PORTAL_INVITATION_CREATED" }),
      );
    });

    it("rejects when the customer already has a portal account", async () => {
      prisma.customer.findFirst.mockResolvedValue({ ...customer, portalAccount: { id: "acc-1" } });

      await expect(svc.createInvitation(input)).rejects.toThrow(CustomerPortalAccountAlreadyExistsError);
      expect(mail.sendCustomerPortalInvitationEmail).not.toHaveBeenCalled();
    });

    it("rejects when the customer is not active", async () => {
      prisma.customer.findFirst.mockResolvedValue({ ...customer, status: "ARCHIVED" });

      await expect(svc.createInvitation(input)).rejects.toThrow(CustomerPortalCustomerInactiveError);
    });

    it("rejects when an open invitation already exists for this customer", async () => {
      prisma.customer.findFirst.mockResolvedValue(customer);
      prisma.organization.findUnique.mockResolvedValue({ status: "ACTIVE" });
      prisma.customerPortalInvitation.findFirst.mockResolvedValue(openInvitation);

      await expect(svc.createInvitation(input)).rejects.toThrow(
        CustomerPortalInvitationAlreadyExistsError,
      );
      expect(prisma.customerPortalInvitation.create).not.toHaveBeenCalled();
    });

    it("rejects when the customer has no email on file", async () => {
      prisma.customer.findFirst.mockResolvedValue({ ...customer, email: null });

      await expect(svc.createInvitation(input)).rejects.toThrow(CustomerPortalInvitationNotFoundError);
    });
  });

  describe("validateInvitationToken / acceptInvitation", () => {
    const withRelations = {
      ...openInvitation,
      organization: { name: "FlowERP Test Logistics" },
      customer: { companyName: "Acme Freight", status: "ACTIVE" },
    };

    it("validates a well-formed, pending, unexpired token", async () => {
      const token = "a".repeat(43);
      prisma.customerPortalInvitation.findUnique.mockResolvedValue(withRelations);

      const result = await svc.validateInvitationToken(token);

      expect(result.invitationId).toBe("inv-1");
      expect(result.organizationName).toBe("FlowERP Test Logistics");
    });

    it("rejects a malformed token as not-found, without querying the database", async () => {
      await expect(svc.validateInvitationToken("too-short")).rejects.toThrow(
        CustomerPortalInvitationNotFoundError,
      );
      expect(prisma.customerPortalInvitation.findUnique).not.toHaveBeenCalled();
    });

    it("rejects a revoked invitation", async () => {
      prisma.customerPortalInvitation.findUnique.mockResolvedValue({
        ...withRelations,
        status: "REVOKED",
        revokedAt: new Date(),
      });

      await expect(svc.validateInvitationToken("a".repeat(43))).rejects.toThrow(
        CustomerPortalInvitationRevokedError,
      );
    });

    it("rejects an expired invitation", async () => {
      prisma.customerPortalInvitation.findUnique.mockResolvedValue({
        ...withRelations,
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(svc.validateInvitationToken("a".repeat(43))).rejects.toThrow(
        CustomerPortalInvitationExpiredError,
      );
    });

    it("accepts a valid invitation and creates exactly one account", async () => {
      const token = "a".repeat(43);
      prisma.customerPortalInvitation.findUnique.mockResolvedValue(withRelations);
      prisma.customerPortalInvitation.updateMany.mockResolvedValue({ count: 1 });
      prisma.customerPortalInvitation.findUniqueOrThrow = jest.fn().mockResolvedValue(openInvitation);
      prisma.customerPortalAccount.create.mockResolvedValue({
        id: "acc-1",
        customerId: "cust-1",
        organizationId: "org-1",
      });
      prisma.organization.findUnique.mockResolvedValue({ status: "ACTIVE" });

      const result = await svc.acceptInvitation({ rawToken: token, password: "correct-horse-battery" });

      expect(result.accountId).toBe("acc-1");
      expect(passwordService.hash).toHaveBeenCalledWith("correct-horse-battery");
      expect(prisma.customerPortalAccount.create).toHaveBeenCalledTimes(1);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: "CUSTOMER_PORTAL_INVITATION_ACCEPTED" }),
      );
    });
  });

  describe("suspendAccess / reactivateAccess", () => {
    it("suspends an existing account and audit-logs it", async () => {
      prisma.customerPortalAccount.updateMany.mockResolvedValue({ count: 1 });

      await svc.suspendAccess("org-1", "cust-1", "user-1");

      expect(prisma.customerPortalAccount.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: "SUSPENDED" } }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: "CUSTOMER_PORTAL_ACCESS_SUSPENDED" }),
      );
    });

    it("throws not-found when there is no account to suspend", async () => {
      prisma.customerPortalAccount.updateMany.mockResolvedValue({ count: 0 });

      await expect(svc.suspendAccess("org-1", "cust-1", "user-1")).rejects.toThrow(
        CustomerPortalInvitationNotFoundError,
      );
    });
  });
});
