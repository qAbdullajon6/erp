import { ConflictException } from "@nestjs/common";
import type { PrismaService } from "../prisma/prisma.service";
import type { AuditService } from "../audit/audit.service";
import type { BillingSeatsService } from "../billing/billing-seats.service";
import type { UpdateMemberDto } from "./dto/update-member.dto";
import type { CurrentUserPayload } from "../auth/interfaces/current-user.interface";
import { OrganizationsService } from "./organizations.service";

/// Regression coverage for the platform-support-membership visibility fix:
/// "Open ERP" support mode (platform-organizations.service.ts) creates a
/// real ACTIVE ADMIN membership for the operator so they can act as staff,
/// and that membership can outlive the support session. It must never (a)
/// appear in a tenant's own member list as if it were one of their own
/// admins, or (b) count toward "is this the last active admin" — otherwise
/// a tenant could demote/remove their real last admin while a phantom,
/// invisible platform-support membership is counted as "another admin"
/// remaining, locking the tenant out.

/// Cast a partial test double to a constructor dependency without `any` —
/// applied only at the injection site so mock variables stay structurally
/// typed for `expect(...)` assertions instead of being widened to the real
/// class's method types.
function asDependency<T>(mock: unknown): T {
  return mock as T;
}

function makeActor(): CurrentUserPayload {
  return { userId: "actor-1", membershipId: "m-actor", organizationId: "org-1", role: "ADMIN" } as CurrentUserPayload;
}

describe("OrganizationsService", () => {
  describe("listMembers", () => {
    it("excludes platform-admin-owned memberships from the tenant's own member list", async () => {
      const prisma = {
        membership: { findMany: jest.fn().mockResolvedValue([]) },
      };
      const audit = {};
      const billingSeats = {};

      const service = new OrganizationsService(
        asDependency<PrismaService>(prisma),
        asDependency<AuditService>(audit),
        asDependency<BillingSeatsService>(billingSeats),
      );
      await service.listMembers("org-1");

      expect(prisma.membership.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: "org-1", user: { isPlatformAdmin: false } },
        }),
      );
    });
  });

  describe("updateMember — last-admin protection", () => {
    it("does not count a platform-admin-owned membership toward the active-admin total", async () => {
      const existing = { id: "m-2", role: "ADMIN", status: "ACTIVE" };
      const prisma = {
        membership: {
          findFirst: jest.fn().mockResolvedValue(existing),
          count: jest.fn().mockResolvedValue(0), // only the platform-support admin remains, excluded
          update: jest.fn(),
        },
      };
      const audit = { log: jest.fn().mockResolvedValue(undefined) };
      const billingSeats = {
        assertCanActivateMembership: jest.fn().mockResolvedValue(undefined),
        syncSeatsUsed: jest.fn().mockResolvedValue(undefined),
      };

      const service = new OrganizationsService(
        asDependency<PrismaService>(prisma),
        asDependency<AuditService>(audit),
        asDependency<BillingSeatsService>(billingSeats),
      );

      await expect(
        service.updateMember(
          "org-1",
          "m-2",
          asDependency<UpdateMemberDto>({ role: "DISPATCHER" }),
          makeActor(),
        ),
      ).rejects.toThrow(ConflictException);

      expect(prisma.membership.count).toHaveBeenCalledWith({
        where: { organizationId: "org-1", role: "ADMIN", status: "ACTIVE", user: { isPlatformAdmin: false } },
      });
    });
  });
});
