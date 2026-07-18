import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import type { CurrentUserPayload } from "../auth/interfaces/current-user.interface";
import { PrismaService } from "../prisma/prisma.service";
import { CreateInvitationDto } from "./dto/create-invitation.dto";
import {
  InvitationService,
  type InvitationListItem,
  type InvitationSummary,
} from "./invitation.service";

/// Admin API for staff invitations. Every route is org-scoped by the path and
/// restricted to that organization's ADMIN.
///
/// Authorization (reusing the project's RBAC): JwtAuthGuard populates req.user
/// from the token, RolesGuard + @Roles("ADMIN") enforces the role, and each
/// handler additionally asserts the token's organization matches the route
/// `:organizationId` — an admin of one organization can never act on another.
///
/// The controller stays thin: it validates the body (CreateInvitationDto via
/// the global ValidationPipe), resolves the two display strings createInvitation
/// is designed to receive from its caller (organization name + inviter name),
/// and delegates every business rule to InvitationService. Service domain errors
/// bubble unchanged through the global exception filter.
///
/// Responses (shared across routes): 401 (no/expired token), 403 (not ADMIN, or
/// a different organization than the route), 404 (unknown invitation), 409
/// (duplicate invitation / already a member), 410 (invitation revoked, accepted,
/// or expired).
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN")
@Controller("organizations/:organizationId/invitations")
export class InvitationController {
  constructor(
    private readonly invitationService: InvitationService,
    private readonly prisma: PrismaService,
  ) {}

  /// The organization's invitations, newest first. 200 with a list carrying
  /// only id/email/role/status/expiresAt/createdAt — never a token, token hash,
  /// or accept URL.
  @Get()
  list(
    @Param("organizationId") organizationId: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<InvitationListItem[]> {
    this.assertSameOrganization(user, organizationId);
    return this.invitationService.listInvitations(organizationId);
  }

  /// Invite a new staff member by email + role. Body: CreateInvitationDto.
  /// 201 with the invitation summary; 409 if an open invitation already exists
  /// for that email in the organization.
  @Post()
  async create(
    @Param("organizationId") organizationId: string,
    @Body() dto: CreateInvitationDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<InvitationSummary> {
    this.assertSameOrganization(user, organizationId);

    // createInvitation is deliberately kept off OrganizationService/UserService,
    // so the caller supplies the organization name and inviter display name it
    // puts in the email (see CreateInvitationInput). Read-only reference data;
    // all invitation rules stay in the service.
    const [organization, inviter] = await Promise.all([
      this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { name: true },
      }),
      this.prisma.user.findUnique({
        where: { id: user.userId },
        select: { firstName: true, lastName: true },
      }),
    ]);

    return this.invitationService.createInvitation({
      organizationId,
      invitedByUserId: user.userId,
      organizationName: organization?.name ?? "",
      inviterDisplayName: inviter ? `${inviter.firstName} ${inviter.lastName}`.trim() : null,
      email: dto.email,
      role: dto.role,
    });
  }

  /// Rotate an invitation's token and re-send its email. 200 with the updated
  /// summary; 404 if unknown in this organization; 410 if revoked/accepted/expired.
  @Post(":invitationId/resend")
  @HttpCode(200)
  resend(
    @Param("organizationId") organizationId: string,
    @Param("invitationId") invitationId: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<InvitationSummary> {
    this.assertSameOrganization(user, organizationId);
    return this.invitationService.resendInvitation(organizationId, invitationId);
  }

  /// Revoke a pending invitation. 200 with the revoked summary; 404 if unknown
  /// in this organization; 410 if already revoked/accepted/expired.
  @Post(":invitationId/revoke")
  @HttpCode(200)
  revoke(
    @Param("organizationId") organizationId: string,
    @Param("invitationId") invitationId: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<InvitationSummary> {
    this.assertSameOrganization(user, organizationId);
    return this.invitationService.revokeInvitation(organizationId, invitationId);
  }

  /// Tenant isolation: the token's organization must match the route. A
  /// mismatch is a cross-tenant attempt — 403, revealing nothing about whether
  /// the other organization or its invitations exist.
  private assertSameOrganization(user: CurrentUserPayload, organizationId: string): void {
    if (user.organizationId !== organizationId) {
      throw new ForbiddenException("You do not have access to this organization");
    }
  }
}
