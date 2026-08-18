import type { PrismaService } from "../prisma/prisma.service";
import type { AuditService } from "../audit/audit.service";
import type { AuthService } from "../auth/auth.service";
import type { PlatformNotificationsService } from "./platform-notifications.service";
import type { CurrentUserPayload } from "../auth/interfaces/current-user.interface";
import { PlatformOrganizationsService } from "./platform-organizations.service";

/// Regression coverage for support-mode exit/switch hardening (QA-C-01/02):
/// leaving (or switching out of) an "Open ERP" support session must
/// (1) revoke refresh tokens for the target org and
/// (2) deactivate the temporary tenant ADMIN membership (unless it is the
/// operator's Platform Console home), so the prior access JWT dies on the
/// next request and organizationSlug login cannot silently re-enter.

/// Cast a partial test double to a constructor dependency without `any` —
/// applied only at the injection site so mock variables stay structurally
/// typed (plain jest.fn() properties) for `expect(...)` assertions instead
/// of being widened to the real class's method types.
function asDependency<T>(mock: unknown): T {
  return mock as T;
}

function makeActor(overrides: Partial<CurrentUserPayload> = {}): CurrentUserPayload {
  return {
    userId: "user-1",
    membershipId: "membership-home",
    organizationId: "org-home",
    role: "ADMIN",
    isPlatformAdmin: true,
    ...overrides,
  } as CurrentUserPayload;
}

describe("PlatformOrganizationsService", () => {
  describe("exitSupport", () => {
    it("revokes refresh tokens and deactivates the temporary support membership", async () => {
      const active = {
        id: "session-1",
        userId: "user-1",
        homeMembershipId: "membership-home",
        targetOrganizationId: "org-target",
        targetMembershipId: "membership-target",
        startedAt: new Date(),
        endedAt: null,
      };

      const prisma = {
        platformSupportSession: {
          findFirst: jest.fn().mockResolvedValue(active),
          update: jest.fn().mockResolvedValue({ ...active, endedAt: new Date() }),
        },
        refreshToken: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        membership: {
          findUnique: jest.fn().mockResolvedValue({ id: "membership-home", status: "ACTIVE" }),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      };

      const audit = { log: jest.fn().mockResolvedValue(undefined) };
      const auth = {
        issueSessionForMembership: jest.fn().mockResolvedValue({ accessToken: "t", refreshToken: "r" }),
      };
      const notifications = {};

      const service = new PlatformOrganizationsService(
        asDependency<PrismaService>(prisma),
        asDependency<AuditService>(audit),
        asDependency<AuthService>(auth),
        asDependency<PlatformNotificationsService>(notifications),
      );

      await service.exitSupport(makeActor());

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: "user-1", organizationId: "org-target", revokedAt: null },
        data: { revokedAt: expect.any(Date) as Date },
      });
      expect(prisma.membership.updateMany).toHaveBeenCalledWith({
        where: { id: "membership-target", status: "ACTIVE" },
        data: { status: "REMOVED" },
      });
      // Revocation must happen for the org being LEFT, never the org being
      // returned to.
      const revokedForHomeOrg = (prisma.refreshToken.updateMany.mock.calls as Array<[{ where: { organizationId: string } }]>).some(
        ([args]) => args.where.organizationId === "org-home",
      );
      expect(revokedForHomeOrg).toBe(false);
    });

    it("does not deactivate the home membership when support target is home", async () => {
      const active = {
        id: "session-1",
        userId: "user-1",
        homeMembershipId: "membership-home",
        targetOrganizationId: "org-home",
        targetMembershipId: "membership-home",
        startedAt: new Date(),
        endedAt: null,
      };

      const prisma = {
        platformSupportSession: {
          findFirst: jest.fn().mockResolvedValue(active),
          update: jest.fn().mockResolvedValue({ ...active, endedAt: new Date() }),
        },
        refreshToken: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        membership: {
          findUnique: jest.fn().mockResolvedValue({ id: "membership-home", status: "ACTIVE" }),
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
      };

      const audit = { log: jest.fn().mockResolvedValue(undefined) };
      const auth = {
        issueSessionForMembership: jest.fn().mockResolvedValue({ accessToken: "t", refreshToken: "r" }),
      };

      const service = new PlatformOrganizationsService(
        asDependency<PrismaService>(prisma),
        asDependency<AuditService>(audit),
        asDependency<AuthService>(auth),
        asDependency<PlatformNotificationsService>({}),
      );

      await service.exitSupport(makeActor());

      expect(prisma.membership.updateMany).not.toHaveBeenCalled();
    });

    it("is a no-op revocation when there is no active support session", async () => {
      const prisma = {
        platformSupportSession: {
          findFirst: jest.fn().mockResolvedValue(null),
        },
        refreshToken: {
          updateMany: jest.fn(),
        },
        membership: {
          updateMany: jest.fn(),
        },
      };

      const audit = { log: jest.fn() };
      const auth = {
        issueSessionForMembership: jest.fn().mockResolvedValue({ accessToken: "t", refreshToken: "r" }),
      };
      const notifications = {};

      const service = new PlatformOrganizationsService(
        asDependency<PrismaService>(prisma),
        asDependency<AuditService>(audit),
        asDependency<AuthService>(auth),
        asDependency<PlatformNotificationsService>(notifications),
      );

      await service.exitSupport(makeActor({ membershipId: "membership-home" }));

      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
      expect(prisma.membership.updateMany).not.toHaveBeenCalled();
      expect(auth.issueSessionForMembership).toHaveBeenCalledWith("user-1", "membership-home");
    });
  });

  describe("enterOrganization — switching directly from org A to org B", () => {
    it("revokes org A's refresh tokens and deactivates org A's support membership", async () => {
      const previousSession = {
        id: "session-a",
        userId: "user-1",
        homeMembershipId: "membership-home",
        targetOrganizationId: "org-a",
        targetMembershipId: "membership-a",
        startedAt: new Date(),
        endedAt: null,
      };

      const prisma = {
        organization: {
          findFirst: jest.fn().mockResolvedValue({ id: "org-b", name: "Org B", slug: "org-b", status: "ACTIVE" }),
        },
        platformSupportSession: {
          findFirst: jest.fn().mockResolvedValue(previousSession),
          update: jest.fn().mockResolvedValue({ ...previousSession, endedAt: new Date() }),
          updateMany: jest.fn(),
          create: jest.fn().mockResolvedValue({ id: "session-b", startedAt: new Date() }),
        },
        membership: {
          findUnique: jest.fn().mockResolvedValue({
            id: "membership-b",
            status: "ACTIVE",
            organization: { id: "org-b" },
          }),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        refreshToken: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      };

      const audit = { log: jest.fn().mockResolvedValue(undefined) };
      const auth = {
        issueSessionForMembership: jest.fn().mockResolvedValue({ accessToken: "t", refreshToken: "r" }),
      };
      const notifications = {};

      const service = new PlatformOrganizationsService(
        asDependency<PrismaService>(prisma),
        asDependency<AuditService>(audit),
        asDependency<AuthService>(auth),
        asDependency<PlatformNotificationsService>(notifications),
      );

      await service.enterOrganization("org-b", makeActor());

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: "user-1", organizationId: "org-a", revokedAt: null },
        data: { revokedAt: expect.any(Date) as Date },
      });
      expect(prisma.membership.updateMany).toHaveBeenCalledWith({
        where: { id: "membership-a", status: "ACTIVE" },
        data: { status: "REMOVED" },
      });
    });
  });
});
