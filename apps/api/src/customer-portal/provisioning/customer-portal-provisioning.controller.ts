import { Controller, Get, HttpCode, Param, Post, UseGuards } from "@nestjs/common";
import type { MembershipRole } from "@prisma/client";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { Roles } from "../../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../../auth/guards/roles.guard";
import type { CurrentUserPayload } from "../../auth/interfaces/current-user.interface";
import { PrismaService } from "../../prisma/prisma.service";
import {
  CustomerPortalProvisioningService,
  type CustomerPortalAccessStatus,
  type CustomerPortalInvitationSummary,
} from "./customer-portal-provisioning.service";

/// Same write-access roles as CustomersController (customers/customers.controller.ts):
/// managing who can log into a customer's portal is a customer-management
/// action, not a separate permission.
const WRITE_ROLES: MembershipRole[] = ["ADMIN", "SALES_CRM_MANAGER"];

/// Staff-facing API for managing one customer's portal access — invite,
/// resend, revoke, suspend, reactivate, and read the current status. Kept as
/// its own controller (not added to CustomersController) so the existing,
/// already-tested customer CRUD surface is untouched.
///
/// Every route is org-scoped by the authenticated staff member's own
/// organizationId (never trusted from the client) and additionally
/// customer-scoped by `:customerId` in the path — CustomerPortalProvisioningService
/// re-verifies the customer belongs to that organization before acting.
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("customers/:customerId/portal-access")
export class CustomerPortalProvisioningController {
  constructor(
    private readonly provisioning: CustomerPortalProvisioningService,
    private readonly prisma: PrismaService,
  ) {}

  /// The current state of this customer's portal access: whether they have
  /// an account, its status, and any pending invitation.
  @Roles(...WRITE_ROLES)
  @Get()
  getStatus(
    @Param("customerId") customerId: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<CustomerPortalAccessStatus> {
    return this.provisioning.getAccessStatus(user.organizationId, customerId);
  }

  /// Invite this customer to the portal — the "enable portal access" action.
  /// 201 with the invitation summary; 409 if the customer already has an
  /// account or an open invitation, or if the customer/organization is not
  /// active.
  @Roles(...WRITE_ROLES)
  @Post("invitations")
  async invite(
    @Param("customerId") customerId: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<CustomerPortalInvitationSummary> {
    const [organization, inviter] = await Promise.all([
      this.prisma.organization.findUnique({ where: { id: user.organizationId }, select: { name: true } }),
      this.prisma.user.findUnique({ where: { id: user.userId }, select: { firstName: true, lastName: true } }),
    ]);

    return this.provisioning.createInvitation({
      organizationId: user.organizationId,
      customerId,
      invitedByUserId: user.userId,
      organizationName: organization?.name ?? "",
      inviterDisplayName: inviter ? `${inviter.firstName} ${inviter.lastName}`.trim() : null,
    });
  }

  /// Rotate an invitation's token and re-send its email. 200 with the
  /// updated summary; 404 if unknown; 410 if revoked/accepted/expired.
  @Roles(...WRITE_ROLES)
  @Post("invitations/:invitationId/resend")
  @HttpCode(200)
  resend(
    @Param("customerId") customerId: string,
    @Param("invitationId") invitationId: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<CustomerPortalInvitationSummary> {
    return this.provisioning.resendInvitation(user.organizationId, customerId, invitationId);
  }

  /// Revoke a pending invitation. 200 with the revoked summary.
  @Roles(...WRITE_ROLES)
  @Post("invitations/:invitationId/revoke")
  @HttpCode(200)
  revoke(
    @Param("customerId") customerId: string,
    @Param("invitationId") invitationId: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<CustomerPortalInvitationSummary> {
    return this.provisioning.revokeInvitation(user.organizationId, customerId, invitationId, user.userId);
  }

  /// Suspend an active portal account, immediately blocking further access.
  @Roles(...WRITE_ROLES)
  @Post("suspend")
  @HttpCode(200)
  async suspend(
    @Param("customerId") customerId: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<{ suspended: true }> {
    await this.provisioning.suspendAccess(user.organizationId, customerId, user.userId);
    return { suspended: true };
  }

  /// Reactivate a suspended portal account.
  @Roles(...WRITE_ROLES)
  @Post("reactivate")
  @HttpCode(200)
  async reactivate(
    @Param("customerId") customerId: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<{ reactivated: true }> {
    await this.provisioning.reactivateAccess(user.organizationId, customerId, user.userId);
    return { reactivated: true };
  }
}
