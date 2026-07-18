import "reflect-metadata";
import { ForbiddenException } from "@nestjs/common";
import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import { MembershipRole } from "@prisma/client";
import type { PrismaService } from "../prisma/prisma.service";
import type { CurrentUserPayload } from "../auth/interfaces/current-user.interface";
import { ROLES_KEY } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { InvitationController } from "./invitation.controller";
import { InvitationService } from "./invitation.service";
import { CreateInvitationDto } from "./dto/create-invitation.dto";
import { InvitationAlreadyExistsError, InvitationExpiredError } from "./invitation.errors";

const ADMIN: CurrentUserPayload = {
  userId: "user-1",
  membershipId: "mem-1",
  organizationId: "org-1",
  role: "ADMIN",
  email: "admin@example.com",
  isPlatformAdmin: false,
};

function build() {
  const invitationService = {
    listInvitations: jest.fn(),
    createInvitation: jest.fn(),
    resendInvitation: jest.fn(),
    revokeInvitation: jest.fn(),
  };
  const prisma = {
    organization: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
  };
  const controller = new InvitationController(
    invitationService as unknown as InvitationService,
    prisma as unknown as PrismaService,
  );
  return { controller, invitationService, prisma };
}

function dto(overrides: Partial<CreateInvitationDto> = {}): CreateInvitationDto {
  return { email: "new@example.com", role: MembershipRole.DISPATCHER, ...overrides };
}

describe("InvitationController — authorization wiring", () => {
  it("restricts the controller to ADMIN via the project's RBAC metadata", () => {
    const roles = Reflect.getMetadata(ROLES_KEY, InvitationController) as MembershipRole[];
    expect(roles).toEqual(["ADMIN"]);
  });

  it("applies JwtAuthGuard and RolesGuard (no new guards invented)", () => {
    const guards = Reflect.getMetadata("__guards__", InvitationController) as unknown[];
    expect(guards).toContain(JwtAuthGuard);
    expect(guards).toContain(RolesGuard);
  });
});

describe("InvitationController.list", () => {
  it("delegates to listInvitations with the route organization and returns it unchanged", async () => {
    const { controller, invitationService } = build();
    const rows = [
      {
        id: "inv-1",
        email: "a@example.com",
        role: "DISPATCHER",
        status: "PENDING",
        expiresAt: new Date(),
        createdAt: new Date(),
      },
    ];
    invitationService.listInvitations.mockResolvedValue(rows);

    const returned = await controller.list("org-1", ADMIN);

    expect(invitationService.listInvitations).toHaveBeenCalledWith("org-1");
    expect(returned).toBe(rows); // pure delegation, no business logic
  });

  it("rejects a cross-tenant list (route org != token org) and never calls the service", () => {
    const { controller, invitationService } = build();
    const otherOrg = { ...ADMIN, organizationId: "org-OTHER" };

    expect(() => controller.list("org-1", otherOrg)).toThrow(ForbiddenException);
    expect(invitationService.listInvitations).not.toHaveBeenCalled();
  });

  it("bubbles service errors unchanged", async () => {
    const { controller, invitationService } = build();
    invitationService.listInvitations.mockRejectedValue(new InvitationAlreadyExistsError());

    await expect(controller.list("org-1", ADMIN)).rejects.toBeInstanceOf(InvitationAlreadyExistsError);
  });
});

describe("InvitationController.create", () => {
  it("calls createInvitation with the route org, the JWT user, and the body", async () => {
    const { controller, invitationService, prisma } = build();
    const result = { id: "inv-1", email: "new@example.com", role: "DISPATCHER", expiresAt: new Date(), status: "PENDING" };
    prisma.organization.findUnique.mockResolvedValue({ name: "Acme Logistics" });
    prisma.user.findUnique.mockResolvedValue({ firstName: "Alex", lastName: "Admin" });
    invitationService.createInvitation.mockResolvedValue(result);

    const returned = await controller.create("org-1", dto(), ADMIN);

    expect(invitationService.createInvitation).toHaveBeenCalledWith({
      organizationId: "org-1", // route param
      invitedByUserId: "user-1", // JWT user
      organizationName: "Acme Logistics",
      inviterDisplayName: "Alex Admin",
      email: "new@example.com",
      role: MembershipRole.DISPATCHER,
    });
    expect(returned).toBe(result); // returns the service response unchanged
  });

  it("passes a null inviter display name when the inviting user is not found", async () => {
    const { controller, invitationService, prisma } = build();
    prisma.organization.findUnique.mockResolvedValue({ name: "Acme Logistics" });
    prisma.user.findUnique.mockResolvedValue(null);
    invitationService.createInvitation.mockResolvedValue({ id: "inv-1" });

    await controller.create("org-1", dto(), ADMIN);

    expect(invitationService.createInvitation).toHaveBeenCalledWith(
      expect.objectContaining({ inviterDisplayName: null }),
    );
  });

  it("rejects a cross-tenant create (route org != token org) and never calls the service", async () => {
    const { controller, invitationService } = build();
    const otherOrg = { ...ADMIN, organizationId: "org-OTHER" };

    await expect(controller.create("org-1", dto(), otherOrg)).rejects.toBeInstanceOf(ForbiddenException);
    expect(invitationService.createInvitation).not.toHaveBeenCalled();
  });

  it("bubbles service domain errors unchanged", async () => {
    const { controller, invitationService, prisma } = build();
    prisma.organization.findUnique.mockResolvedValue({ name: "Acme Logistics" });
    prisma.user.findUnique.mockResolvedValue({ firstName: "Alex", lastName: "Admin" });
    invitationService.createInvitation.mockRejectedValue(new InvitationAlreadyExistsError());

    await expect(controller.create("org-1", dto(), ADMIN)).rejects.toBeInstanceOf(InvitationAlreadyExistsError);
  });
});

describe("InvitationController.resend", () => {
  it("calls resendInvitation(organizationId, invitationId)", async () => {
    const { controller, invitationService } = build();
    const result = { id: "inv-1", status: "PENDING" };
    invitationService.resendInvitation.mockResolvedValue(result);

    const returned = await controller.resend("org-1", "inv-1", ADMIN);

    expect(invitationService.resendInvitation).toHaveBeenCalledWith("org-1", "inv-1");
    expect(returned).toBe(result);
  });

  it("rejects a cross-tenant resend and never calls the service", () => {
    const { controller, invitationService } = build();
    const otherOrg = { ...ADMIN, organizationId: "org-OTHER" };

    expect(() => controller.resend("org-1", "inv-1", otherOrg)).toThrow(ForbiddenException);
    expect(invitationService.resendInvitation).not.toHaveBeenCalled();
  });

  it("bubbles service domain errors unchanged", async () => {
    const { controller, invitationService } = build();
    invitationService.resendInvitation.mockRejectedValue(new InvitationExpiredError());

    await expect(controller.resend("org-1", "inv-1", ADMIN)).rejects.toBeInstanceOf(InvitationExpiredError);
  });
});

describe("InvitationController.revoke", () => {
  it("calls revokeInvitation(organizationId, invitationId)", async () => {
    const { controller, invitationService } = build();
    const result = { id: "inv-1", status: "REVOKED" };
    invitationService.revokeInvitation.mockResolvedValue(result);

    const returned = await controller.revoke("org-1", "inv-1", ADMIN);

    expect(invitationService.revokeInvitation).toHaveBeenCalledWith("org-1", "inv-1");
    expect(returned).toBe(result);
  });

  it("rejects a cross-tenant revoke and never calls the service", () => {
    const { controller, invitationService } = build();
    const otherOrg = { ...ADMIN, organizationId: "org-OTHER" };

    expect(() => controller.revoke("org-1", "inv-1", otherOrg)).toThrow(ForbiddenException);
    expect(invitationService.revokeInvitation).not.toHaveBeenCalled();
  });
});

describe("CreateInvitationDto validation", () => {
  it("rejects an invalid email", async () => {
    const errors = await validate(plainToInstance(CreateInvitationDto, { email: "not-an-email", role: "DISPATCHER" }));
    expect(errors.some((e) => e.property === "email")).toBe(true);
  });

  it("rejects a role outside the enum", async () => {
    const errors = await validate(plainToInstance(CreateInvitationDto, { email: "a@b.com", role: "NOT_A_ROLE" }));
    expect(errors.some((e) => e.property === "role")).toBe(true);
  });

  it("rejects a missing email and role", async () => {
    const errors = await validate(plainToInstance(CreateInvitationDto, {}));
    const properties = errors.map((e) => e.property).sort();
    expect(properties).toEqual(["email", "role"]);
  });

  it("accepts a valid payload", async () => {
    const errors = await validate(plainToInstance(CreateInvitationDto, { email: "a@b.com", role: "DISPATCHER" }));
    expect(errors).toHaveLength(0);
  });
});
