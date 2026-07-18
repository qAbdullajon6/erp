import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Test, TestingModule } from "@nestjs/testing";
import { AuditService } from "../../audit/audit.service";
import { PrismaService } from "../../prisma/prisma.service";
import { PasswordService } from "../../auth/password.service";
import { CustomerPortalAuthService } from "./customer-portal-auth.service";
import { CustomerPortalLoginDto } from "./dto/login.dto";
import { CustomerPortalRefreshDto } from "./dto/refresh.dto";
import { CustomerPortalChangePasswordDto } from "./dto/change-password.dto";

describe("CustomerPortalAuthService", () => {
  let svc: CustomerPortalAuthService;
  let prisma: any;
  let passwordService: any;
  let jwtService: any;
  let audit: any;

  const mockAccount = {
    id: "acc-1",
    organizationId: "org-1",
    customerId: "cust-1",
    email: "customer@test.com",
    passwordHash: "$argon2id$hashed",
    status: "ACTIVE",
    customer: {
      id: "cust-1",
      companyName: "Test Corp",
      contactName: "John",
      status: "ACTIVE",
    },
    organization: { id: "org-1", status: "ACTIVE" },
  };

  beforeEach(async () => {
    prisma = {
      organization: { findFirst: jest.fn() },
      customerPortalAccount: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      customerRefreshToken: {
        create: jest.fn(),
        findUnique: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn((queries) => Promise.all(queries)),
    };
    passwordService = { verify: jest.fn(), hash: jest.fn() };
    jwtService = { sign: jest.fn(() => "access-token") };
    audit = { log: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomerPortalAuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwtService },
        { provide: PasswordService, useValue: passwordService },
        { provide: AuditService, useValue: audit },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === "auth")
                return {
                  jwtAccessSecret: "secret",
                  jwtAccessExpiresInSeconds: 900,
                  refreshTokenExpiresInDays: 30,
                };
              return {};
            }),
          },
        },
      ],
    }).compile();

    svc = module.get(CustomerPortalAuthService);
  });

  const loginDto = (overrides: Partial<CustomerPortalLoginDto> = {}) => {
    const d = new CustomerPortalLoginDto();
    d.email = "customer@test.com";
    d.password = "correct-password";
    Object.assign(d, overrides);
    return d;
  };

  describe("login — organization resolution (the fixed bug)", () => {
    // Regression coverage for the audit finding: the originally recovered
    // login() resolved an arbitrary "first ACTIVE organization" whenever
    // organizationSlug was omitted, and only then looked for a matching
    // account in THAT org — so a customer in any org other than whichever one
    // Postgres happened to return first could never log in, no matter how
    // correct their password was. These tests pin the fixed behavior:
    // resolve by email across every organization when no slug is given.

    it("finds the account by email alone when no organizationSlug is given and exactly one matches", async () => {
      prisma.customerPortalAccount.findMany.mockResolvedValue([mockAccount]);
      passwordService.verify.mockResolvedValue(true);

      const result = await svc.login(loginDto());

      expect(prisma.customerPortalAccount.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { email: { equals: "customer@test.com", mode: "insensitive" } } }),
      );
      // The old bug: this must NOT have gone through organization.findFirst at all.
      expect(prisma.organization.findFirst).not.toHaveBeenCalled();
      expect(result.customer.id).toBe("cust-1");
    });

    it("rejects with a clear disambiguation error when the email matches more than one organization's account", async () => {
      const other = { ...mockAccount, id: "acc-2", organizationId: "org-2" };
      prisma.customerPortalAccount.findMany.mockResolvedValue([mockAccount, other]);

      await expect(svc.login(loginDto())).rejects.toThrow(
        /more than one organization/i,
      );
      // Must fail before ever touching the password — no account is
      // definitively identified yet.
      expect(passwordService.verify).not.toHaveBeenCalled();
    });

    it("scopes to the given organization when organizationSlug is provided", async () => {
      prisma.organization.findFirst.mockResolvedValue({ id: "org-1", status: "ACTIVE" });
      prisma.customerPortalAccount.findFirst.mockResolvedValue(mockAccount);
      passwordService.verify.mockResolvedValue(true);

      await svc.login(loginDto({ organizationSlug: "acme" }));

      expect(prisma.organization.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: "ACTIVE", slug: "acme" } }),
      );
      expect(prisma.customerPortalAccount.findMany).not.toHaveBeenCalled();
    });

    it("rejects with a generic message when organizationSlug doesn't match any organization", async () => {
      prisma.organization.findFirst.mockResolvedValue(null);

      await expect(svc.login(loginDto({ organizationSlug: "no-such-org" }))).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("rejects with a generic message when no account matches the email at all", async () => {
      prisma.customerPortalAccount.findMany.mockResolvedValue([]);

      await expect(svc.login(loginDto())).rejects.toThrow("Invalid email or password");
    });
  });

  describe("login", () => {
    it("succeeds with valid credentials", async () => {
      prisma.customerPortalAccount.findMany.mockResolvedValue([mockAccount]);
      passwordService.verify.mockResolvedValue(true);

      const result = await svc.login(loginDto());

      expect(result.accessToken).toBe("access-token");
      expect(result.customer.email).toBe("customer@test.com");
      expect(result.customer.id).toBe("cust-1");
      expect(jwtService.sign).toHaveBeenCalledWith({ sub: "acc-1", cid: "cust-1" });
      expect(prisma.customerRefreshToken.create).toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: "CUSTOMER_PORTAL_LOGIN" }));
    });

    it("throws Unauthorized for wrong password", async () => {
      prisma.customerPortalAccount.findMany.mockResolvedValue([mockAccount]);
      passwordService.verify.mockResolvedValue(false);

      await expect(svc.login(loginDto())).rejects.toThrow(UnauthorizedException);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: "CUSTOMER_PORTAL_LOGIN_FAILED" }),
      );
    });

    it("throws Unauthorized when account is suspended", async () => {
      prisma.customerPortalAccount.findMany.mockResolvedValue([{ ...mockAccount, status: "SUSPENDED" }]);
      passwordService.verify.mockResolvedValue(true);

      await expect(svc.login(loginDto())).rejects.toThrow(UnauthorizedException);
    });

    it("throws Unauthorized when customer is inactive", async () => {
      prisma.customerPortalAccount.findMany.mockResolvedValue([
        { ...mockAccount, customer: { ...mockAccount.customer, status: "INACTIVE" } },
      ]);
      passwordService.verify.mockResolvedValue(true);

      await expect(svc.login(loginDto())).rejects.toThrow(UnauthorizedException);
    });
  });

  describe("refresh", () => {
    it("succeeds and rotates tokens", async () => {
      const now = new Date();
      const future = new Date(now.getTime() + 86_400_000);
      prisma.customerRefreshToken.findUnique.mockResolvedValue({
        id: "rt-1",
        accountId: "acc-1",
        organizationId: "org-1",
        tokenHash: "hash",
        expiresAt: future,
        revokedAt: null,
        account: mockAccount,
      });

      const result = await svc.refresh({ refreshToken: "raw-token" } as CustomerPortalRefreshDto);

      expect(result.accessToken).toBe("access-token");
      expect(prisma.customerRefreshToken.update).toHaveBeenCalled();
      expect(prisma.customerRefreshToken.create).toHaveBeenCalled();
    });

    it("throws when refresh token is expired", async () => {
      prisma.customerRefreshToken.findUnique.mockResolvedValue({
        id: "rt-1",
        accountId: "acc-1",
        expiresAt: new Date(Date.now() - 1000),
        revokedAt: null,
        account: mockAccount,
      });

      await expect(svc.refresh({ refreshToken: "raw-token" } as CustomerPortalRefreshDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("throws when the account has since been suspended", async () => {
      prisma.customerRefreshToken.findUnique.mockResolvedValue({
        id: "rt-1",
        accountId: "acc-1",
        expiresAt: new Date(Date.now() + 86_400_000),
        revokedAt: null,
        account: { ...mockAccount, status: "SUSPENDED" },
      });

      await expect(svc.refresh({ refreshToken: "raw-token" } as CustomerPortalRefreshDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe("changePassword", () => {
    const payload = {
      accountId: "acc-1",
      customerId: "cust-1",
      organizationId: "org-1",
      email: "",
      companyName: "",
    };
    const changeDto = () => {
      const d = new CustomerPortalChangePasswordDto();
      d.currentPassword = "old-pass";
      d.newPassword = "new-pass-long";
      return d;
    };

    it("succeeds with correct current password and revokes other sessions", async () => {
      prisma.customerPortalAccount.findUnique.mockResolvedValue(mockAccount);
      passwordService.verify.mockResolvedValue(true);
      passwordService.hash.mockResolvedValue("new-hash");
      prisma.customerRefreshToken.updateMany.mockResolvedValue({ count: 2 });

      await svc.changePassword(payload, changeDto());

      expect(prisma.customerPortalAccount.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { passwordHash: "new-hash" } }),
      );
      // A password change is a compromise-recovery point: every other active
      // session for this account is revoked immediately.
      expect(prisma.customerRefreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { accountId: "acc-1", revokedAt: null } }),
      );
    });

    it("throws BadRequest with wrong current password", async () => {
      prisma.customerPortalAccount.findUnique.mockResolvedValue(mockAccount);
      passwordService.verify.mockResolvedValue(false);

      await expect(svc.changePassword(payload, changeDto())).rejects.toThrow(BadRequestException);
    });
  });

  describe("logout", () => {
    it("revokes the refresh token", async () => {
      prisma.customerRefreshToken.updateMany.mockResolvedValue({ count: 1 });

      await svc.logout("acc-1", "raw-token");

      expect(prisma.customerRefreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { accountId: "acc-1", tokenHash: expect.any(String), revokedAt: null },
        }),
      );
    });
  });
});
