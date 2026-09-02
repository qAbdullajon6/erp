import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { MembershipRole, MembershipStatus } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { BillingSeatsService } from "../billing/billing-seats.service";
import { PrismaService } from "../prisma/prisma.service";
import type { CurrentUserPayload } from "../auth/interfaces/current-user.interface";
import { UpdateMemberDto } from "./dto/update-member.dto";
import { UpdateOrganizationDto } from "./dto/update-organization.dto";

/// Three distinct client intentions have to survive the round trip:
/// `undefined` (field absent — leave the column alone), an explicit value, and
/// "clear this field". The UI clears by submitting an empty input, so `""` and
/// whitespace-only input both fold to `null` rather than being stored as an
/// empty string that would later print as a blank line on an invoice.
function normalizeOptionalText(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function normalizeOptionalEmail(value: string | null | undefined): string | null | undefined {
  const normalized = normalizeOptionalText(value);
  return typeof normalized === "string" ? normalized.toLowerCase() : normalized;
}

type CompanyIdentityRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  defaultCurrency: string;
  timezone: string;
  legalName: string | null;
  registrationNumber: string | null;
  taxId: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  postalCode: string | null;
  country: string | null;
  logoUrl: string | null;
};

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly billingSeatsService: BillingSeatsService,
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
    const data = {
      name: dto.name?.trim(),
      defaultCurrency: dto.defaultCurrency,
      timezone: dto.timezone,
      legalName: normalizeOptionalText(dto.legalName),
      registrationNumber: normalizeOptionalText(dto.registrationNumber),
      taxId: normalizeOptionalText(dto.taxId),
      email: normalizeOptionalEmail(dto.email),
      phone: normalizeOptionalText(dto.phone),
      website: normalizeOptionalText(dto.website),
      address: normalizeOptionalText(dto.address),
      city: normalizeOptionalText(dto.city),
      postalCode: normalizeOptionalText(dto.postalCode),
      country: normalizeOptionalText(dto.country),
      logoUrl: normalizeOptionalText(dto.logoUrl),
    };

    const organization = await this.prisma.organization.update({
      where: { id: organizationId },
      data,
    });

    // Log the normalized values actually written rather than the raw DTO, so
    // the audit trail matches the stored state (a cleared field reads as null,
    // not as the "" the client happened to send).
    await this.auditService.log({
      organizationId,
      actorUserId: actor.userId,
      action: "organization.update",
      entityType: "Organization",
      entityId: organizationId,
      metadata: {
        changes: Object.fromEntries(
          Object.entries(data).filter(([, value]) => value !== undefined),
        ),
      },
    });

    return this.toOrganizationResponse(organization);
  }

  async listMembers(organizationId: string) {
    // Platform-support "enter org" (platform-organizations.service.ts)
    // creates a real ADMIN membership for the operator so they can act as
    // staff while assisting a tenant, and that membership outlives the
    // support session. It must never surface in the tenant's own member
    // list as if it were one of their own admins — platform's own org
    // listings already exclude these via the same `isPlatformAdmin: false`
    // filter.
    const memberships = await this.prisma.membership.findMany({
      where: { organizationId, user: { isPlatformAdmin: false } },
      include: { user: true },
      orderBy: { createdAt: "asc" },
    });

    return memberships.map((membership) => this.toMemberResponse(membership));
  }

  async updateMember(
    organizationId: string,
    membershipId: string,
    dto: UpdateMemberDto,
    actor: CurrentUserPayload,
  ) {
    const existing = await this.prisma.membership.findFirst({
      where: { id: membershipId, organizationId },
      include: { user: true },
    });
    if (!existing) {
      throw new NotFoundException("Member not found in this organization");
    }

    this.assertActiveMemberRoleEditable(existing.status, dto);
    await this.assertChangeDoesNotRemoveLastAdmin(organizationId, membershipId, dto.role, dto.status, existing);
    await this.billingSeatsService.assertCanActivateMembership(organizationId, membershipId, dto.status);

    const membership = await this.prisma.membership.update({
      where: { id: membershipId },
      data: { role: dto.role, status: dto.status },
      include: { user: true },
    });
    await this.billingSeatsService.syncSeatsUsed(organizationId);

    const reactivated = existing.status !== "ACTIVE" && dto.status === "ACTIVE";
    await this.auditService.log({
      organizationId,
      actorUserId: actor.userId,
      action: reactivated ? "organization.member.reactivate" : "organization.member.update",
      entityType: "Membership",
      entityId: membershipId,
      metadata: reactivated ? { previousStatus: existing.status } : { changes: dto },
    });

    return this.toMemberResponse(membership);
  }

  /// Role changes apply only to ACTIVE memberships. Removed or invited
  /// members may be reactivated (status -> ACTIVE) but their role cannot be
  /// edited until they are active again.
  private assertActiveMemberRoleEditable(
    currentStatus: MembershipStatus,
    dto: UpdateMemberDto,
  ): void {
    if (currentStatus === "ACTIVE") {
      return;
    }
    if (dto.role !== undefined) {
      throw new BadRequestException(
        "Cannot change role for inactive members. Reactivate the member first.",
      );
    }
    if (dto.status !== undefined && dto.status !== "ACTIVE") {
      throw new BadRequestException(
        "Inactive members can only be reactivated to ACTIVE status.",
      );
    }
  }

  async removeMember(organizationId: string, membershipId: string, actor: CurrentUserPayload) {
    await this.assertChangeDoesNotRemoveLastAdmin(organizationId, membershipId, undefined, "REMOVED");

    const membership = await this.prisma.membership.update({
      where: { id: membershipId },
      data: { status: "REMOVED" },
    });
    await this.billingSeatsService.syncSeatsUsed(organizationId);

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
    membership?: { role: MembershipRole; status: MembershipStatus } | null,
  ) {
    const resolvedMembership =
      membership ??
      (await this.prisma.membership.findFirst({
        where: { id: membershipId, organizationId },
      }));

    if (!resolvedMembership) {
      throw new NotFoundException("Member not found in this organization");
    }

    const isCurrentlyActiveAdmin =
      resolvedMembership.role === "ADMIN" && resolvedMembership.status === "ACTIVE";
    const willStayActiveAdmin =
      (becomingRole ?? resolvedMembership.role) === "ADMIN" &&
      (becomingStatus ?? resolvedMembership.status) === "ACTIVE";

    if (isCurrentlyActiveAdmin && !willStayActiveAdmin) {
      // Exclude platform-support memberships (see listMembers) from the
      // count — otherwise a lingering support-session membership makes the
      // system think a real admin can safely be demoted/removed, leaving
      // the tenant with zero staff-visible admins.
      const activeAdminCount = await this.prisma.membership.count({
        where: { organizationId, role: "ADMIN", status: "ACTIVE", user: { isPlatformAdmin: false } },
      });
      if (activeAdminCount <= 1) {
        throw new ConflictException(
          "Cannot remove or demote the last active admin of this organization",
        );
      }
    }

    return resolvedMembership;
  }

  /// Explicit projection rather than returning the Prisma row, so adding a
  /// column to Organization never silently widens this public payload.
  private toOrganizationResponse(organization: CompanyIdentityRow) {
    return {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      status: organization.status,
      defaultCurrency: organization.defaultCurrency,
      timezone: organization.timezone,
      legalName: organization.legalName,
      registrationNumber: organization.registrationNumber,
      taxId: organization.taxId,
      email: organization.email,
      phone: organization.phone,
      website: organization.website,
      address: organization.address,
      city: organization.city,
      postalCode: organization.postalCode,
      country: organization.country,
      logoUrl: organization.logoUrl,
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
