import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { MembershipRole, MembershipStatus } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import type { CurrentUserPayload } from "../auth/interfaces/current-user.interface";
import { AddMemberDto } from "./dto/add-member.dto";
import { UpdateMemberDto } from "./dto/update-member.dto";
import { UpdateOrganizationDto } from "./dto/update-organization.dto";

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async getCurrent(organizationId: string) {
    const organization = await this.prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
    });
    return this.toOrganizationResponse(organization);
  }

  async updateCurrent(
    organizationId: string,
    dto: UpdateOrganizationDto,
    actor: CurrentUserPayload,
  ) {
    const organization = await this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        name: dto.name,
        defaultCurrency: dto.defaultCurrency,
        timezone: dto.timezone,
      },
    });

    await this.auditService.log({
      organizationId,
      actorUserId: actor.userId,
      action: "organization.update",
      entityType: "Organization",
      entityId: organizationId,
      metadata: { changes: dto },
    });

    return this.toOrganizationResponse(organization);
  }

  async listMembers(organizationId: string) {
    const memberships = await this.prisma.membership.findMany({
      where: { organizationId },
      include: { user: true },
      orderBy: { createdAt: "asc" },
    });

    return memberships.map((membership) => this.toMemberResponse(membership));
  }

  async addMember(organizationId: string, dto: AddMemberDto, actor: CurrentUserPayload) {
    const email = dto.email.toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new NotFoundException(
        "No user account exists with this email — invite-by-email for new users is not implemented yet",
      );
    }

    const existingMembership = await this.prisma.membership.findUnique({
      where: { organizationId_userId: { organizationId, userId: user.id } },
    });
    if (existingMembership) {
      throw new ConflictException("This user is already a member of this organization");
    }

    const membership = await this.prisma.membership.create({
      data: { organizationId, userId: user.id, role: dto.role, status: "ACTIVE" },
      include: { user: true },
    });

    await this.auditService.log({
      organizationId,
      actorUserId: actor.userId,
      action: "organization.member.add",
      entityType: "Membership",
      entityId: membership.id,
      metadata: { addedUserId: user.id, role: dto.role },
    });

    return this.toMemberResponse(membership);
  }

  async updateMember(
    organizationId: string,
    membershipId: string,
    dto: UpdateMemberDto,
    actor: CurrentUserPayload,
  ) {
    await this.assertChangeDoesNotRemoveLastAdmin(organizationId, membershipId, dto.role, dto.status);

    const membership = await this.prisma.membership.update({
      where: { id: membershipId },
      data: { role: dto.role, status: dto.status },
      include: { user: true },
    });

    await this.auditService.log({
      organizationId,
      actorUserId: actor.userId,
      action: "organization.member.update",
      entityType: "Membership",
      entityId: membershipId,
      metadata: { changes: dto },
    });

    return this.toMemberResponse(membership);
  }

  async removeMember(organizationId: string, membershipId: string, actor: CurrentUserPayload) {
    await this.assertChangeDoesNotRemoveLastAdmin(organizationId, membershipId, undefined, "REMOVED");

    const membership = await this.prisma.membership.update({
      where: { id: membershipId },
      data: { status: "REMOVED" },
    });

    await this.auditService.log({
      organizationId,
      actorUserId: actor.userId,
      action: "organization.member.remove",
      entityType: "Membership",
      entityId: membershipId,
    });

    return { id: membership.id, status: membership.status };
  }

  /// Looks up the membership (scoped to this organization — a membership ID
  /// from another org returns 404, never leaking whether it exists), then
  /// blocks the change if it would leave the organization with zero active
  /// admins.
  private async assertChangeDoesNotRemoveLastAdmin(
    organizationId: string,
    membershipId: string,
    becomingRole: MembershipRole | undefined,
    becomingStatus: MembershipStatus | undefined,
  ) {
    const membership = await this.prisma.membership.findFirst({
      where: { id: membershipId, organizationId },
    });
    if (!membership) {
      throw new NotFoundException("Member not found in this organization");
    }

    const isCurrentlyActiveAdmin = membership.role === "ADMIN" && membership.status === "ACTIVE";
    const willStayActiveAdmin =
      (becomingRole ?? membership.role) === "ADMIN" &&
      (becomingStatus ?? membership.status) === "ACTIVE";

    if (isCurrentlyActiveAdmin && !willStayActiveAdmin) {
      const activeAdminCount = await this.prisma.membership.count({
        where: { organizationId, role: "ADMIN", status: "ACTIVE" },
      });
      if (activeAdminCount <= 1) {
        throw new ConflictException(
          "Cannot remove or demote the last active admin of this organization",
        );
      }
    }

    return membership;
  }

  private toOrganizationResponse(organization: {
    id: string;
    name: string;
    slug: string;
    status: string;
    defaultCurrency: string;
    timezone: string;
  }) {
    return {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      status: organization.status,
      defaultCurrency: organization.defaultCurrency,
      timezone: organization.timezone,
    };
  }

  private toMemberResponse(membership: {
    id: string;
    role: MembershipRole;
    status: MembershipStatus;
    createdAt: Date;
    user: { id: string; email: string; firstName: string; lastName: string };
  }) {
    return {
      id: membership.id,
      role: membership.role,
      status: membership.status,
      createdAt: membership.createdAt,
      user: {
        id: membership.user.id,
        email: membership.user.email,
        firstName: membership.user.firstName,
        lastName: membership.user.lastName,
      },
    };
  }
}
