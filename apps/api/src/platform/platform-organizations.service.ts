import { Injectable, NotFoundException } from "@nestjs/common";
import { OrganizationStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AuthService } from "../auth/auth.service";
import type { CurrentUserPayload } from "../auth/interfaces/current-user.interface";
import { PlatformNotificationsService } from "./platform-notifications.service";
import type { ListPlatformOrganizationsQueryDto } from "./dto/list-organizations.dto";

@Injectable()
export class PlatformOrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
    private readonly notifications: PlatformNotificationsService,
  ) {}

  async list(query: ListPlatformOrganizationsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.OrganizationWhereInput = {
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: "insensitive" } },
              { slug: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [total, items] = await this.prisma.$transaction([
      this.prisma.organization.count({ where }),
      this.prisma.organization.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          subscription: { include: { plan: true } },
          _count: { select: { memberships: true, drivers: true, vehicles: true, orders: true } },
        },
      }),
    ]);

    return {
      items: items.map((org) => ({
        id: org.id,
        name: org.name,
        slug: org.slug,
        status: org.status,
        createdAt: org.createdAt,
        memberCount: org._count.memberships,
        driverCount: org._count.drivers,
        vehicleCount: org._count.vehicles,
        orderCount: org._count.orders,
        plan: org.subscription?.plan
          ? { id: org.subscription.plan.id, name: org.subscription.plan.name, slug: org.subscription.plan.slug }
          : null,
        subscriptionStatus: org.subscription?.status ?? null,
        mrrCents: org.subscription?.plan?.price ?? 0,
      })),
      meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  async getById(id: string) {
    const org = await this.prisma.organization.findFirst({
      where: { id, deletedAt: null },
      include: {
        subscription: { include: { plan: true } },
        memberships: {
          where: { status: "ACTIVE" },
          take: 20,
          orderBy: { createdAt: "asc" },
          include: {
            user: { select: { id: true, email: true, firstName: true, lastName: true, isPlatformAdmin: true } },
          },
        },
        _count: {
          select: { memberships: true, drivers: true, vehicles: true, orders: true, customers: true },
        },
      },
    });
    if (!org) throw new NotFoundException("Organization not found");

    const recentAudit = await this.prisma.auditLog.findMany({
      where: { organizationId: id },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      status: org.status,
      defaultCurrency: org.defaultCurrency,
      timezone: org.timezone,
      createdAt: org.createdAt,
      updatedAt: org.updatedAt,
      counts: org._count,
      subscription: org.subscription
        ? {
            id: org.subscription.id,
            status: org.subscription.status,
            currentPeriodEnd: org.subscription.currentPeriodEnd,
            plan: org.subscription.plan,
          }
        : null,
      members: org.memberships.map((m) => ({
        id: m.id,
        role: m.role,
        user: m.user,
      })),
      recentAudit,
    };
  }

  async updateStatus(id: string, status: OrganizationStatus, actor: CurrentUserPayload) {
    const org = await this.prisma.organization.findFirst({ where: { id, deletedAt: null } });
    if (!org) throw new NotFoundException("Organization not found");

    const updated = await this.prisma.organization.update({
      where: { id },
      data: { status },
    });

    await this.audit.log({
      organizationId: id,
      actorUserId: actor.userId,
      action: status === "SUSPENDED" ? "platform.org.suspend" : "platform.org.status_change",
      entityType: "Organization",
      entityId: id,
      metadata: { from: org.status, to: status },
    });

    if (status === "SUSPENDED") {
      await this.notifications.create({
        type: "organization.suspended",
        severity: "WARNING",
        title: "Organization suspended",
        body: `${org.name} was suspended by platform staff.`,
        entityType: "Organization",
        entityId: id,
      });
    }

    return updated;
  }

  async enterOrganization(organizationId: string, actor: CurrentUserPayload) {
    const org = await this.prisma.organization.findFirst({
      where: { id: organizationId, deletedAt: null },
    });
    if (!org) throw new NotFoundException("Organization not found");

    const homeMembershipId = actor.membershipId;

    let membership = await this.prisma.membership.findUnique({
      where: { organizationId_userId: { organizationId, userId: actor.userId } },
      include: { organization: true },
    });

    if (!membership) {
      membership = await this.prisma.membership.create({
        data: {
          organizationId,
          userId: actor.userId,
          role: "ADMIN",
          status: "ACTIVE",
        },
        include: { organization: true },
      });
    } else if (membership.status !== "ACTIVE") {
      membership = await this.prisma.membership.update({
        where: { id: membership.id },
        data: { status: "ACTIVE" },
        include: { organization: true },
      });
    }

    await this.prisma.platformSupportSession.updateMany({
      where: { userId: actor.userId, endedAt: null },
      data: { endedAt: new Date() },
    });

    const session = await this.prisma.platformSupportSession.create({
      data: {
        userId: actor.userId,
        homeMembershipId,
        targetOrganizationId: organizationId,
        targetMembershipId: membership.id,
      },
    });

    await this.audit.log({
      organizationId,
      actorUserId: actor.userId,
      action: "platform.support.enter",
      entityType: "Organization",
      entityId: organizationId,
      metadata: { supportSessionId: session.id, homeMembershipId },
    });

    const auth = await this.auth.issueSessionForMembership(actor.userId, membership.id);
    return {
      ...auth,
      supportSession: {
        id: session.id,
        organizationId: org.id,
        organizationName: org.name,
        organizationSlug: org.slug,
        startedAt: session.startedAt,
      },
    };
  }

  async exitSupport(actor: CurrentUserPayload) {
    const active = await this.prisma.platformSupportSession.findFirst({
      where: { userId: actor.userId, endedAt: null },
      orderBy: { startedAt: "desc" },
    });
    if (!active) {
      // Already outside support — return a fresh session for current membership.
      return this.auth.issueSessionForMembership(actor.userId, actor.membershipId);
    }

    await this.prisma.platformSupportSession.update({
      where: { id: active.id },
      data: { endedAt: new Date() },
    });

    const home = await this.prisma.membership.findUnique({
      where: { id: active.homeMembershipId },
    });
    const membershipId =
      home && home.status === "ACTIVE" ? home.id : actor.membershipId;

    await this.audit.log({
      organizationId: active.targetOrganizationId,
      actorUserId: actor.userId,
      action: "platform.support.exit",
      entityType: "Organization",
      entityId: active.targetOrganizationId,
      metadata: { supportSessionId: active.id, homeMembershipId: membershipId },
    });

    return this.auth.issueSessionForMembership(actor.userId, membershipId);
  }
}
