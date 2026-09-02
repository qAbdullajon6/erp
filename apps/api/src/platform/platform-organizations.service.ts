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
          _count: {
            select: {
              memberships: { where: { status: "ACTIVE", user: { isPlatformAdmin: false } } },
              drivers: true,
              vehicles: true,
              orders: true,
            },
          },
        },
      }),
    ]);

    const orgIds = items.map((o) => o.id);
    const [lastAudit, lastOrders, lastSessions] = orgIds.length
      ? await Promise.all([
          this.prisma.auditLog.groupBy({
            by: ["organizationId"],
            where: { organizationId: { in: orgIds } },
            _max: { createdAt: true },
          }),
          this.prisma.order.groupBy({
            by: ["organizationId"],
            where: { organizationId: { in: orgIds } },
            _max: { updatedAt: true },
          }),
          this.prisma.refreshToken.groupBy({
            by: ["organizationId"],
            where: { organizationId: { in: orgIds } },
            _max: { createdAt: true },
          }),
        ])
      : [[], [], []];

    const lastActivityByOrg = new Map<string, Date>();
    for (const row of [...lastAudit, ...lastSessions]) {
      const id = row.organizationId;
      if (!id || !row._max.createdAt) continue;
      const prev = lastActivityByOrg.get(id);
      if (!prev || row._max.createdAt > prev) lastActivityByOrg.set(id, row._max.createdAt);
    }
    for (const row of lastOrders) {
      if (!row._max.updatedAt) continue;
      const prev = lastActivityByOrg.get(row.organizationId);
      if (!prev || row._max.updatedAt > prev) {
        lastActivityByOrg.set(row.organizationId, row._max.updatedAt);
      }
    }

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
        lastActivityAt: lastActivityByOrg.get(org.id)?.toISOString() ?? null,
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
          // Platform staff get temporary ADMIN memberships for Open ERP —
          // they must never appear as customer employees in Members.
          where: { status: "ACTIVE", user: { isPlatformAdmin: false } },
          take: 20,
          orderBy: { createdAt: "asc" },
          include: {
            user: { select: { id: true, email: true, firstName: true, lastName: true, isPlatformAdmin: true } },
          },
        },
        _count: {
          select: {
            memberships: { where: { status: "ACTIVE", user: { isPlatformAdmin: false } } },
            drivers: true,
            vehicles: true,
            orders: true,
            customers: true,
          },
        },
      },
    });
    if (!org) throw new NotFoundException("Organization not found");

    const recentAudit = await this.prisma.auditLog.findMany({
      where: { organizationId: id },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);

    const [ordersThisMonth, invoicesThisMonth, lastSession, storageAgg, activeSupport] =
      await Promise.all([
      this.prisma.order.count({
        where: { organizationId: id, createdAt: { gte: monthStart } },
      }),
      this.prisma.invoice.count({
        where: { organizationId: id, createdAt: { gte: monthStart } },
      }),
      this.prisma.refreshToken.findFirst({
        where: {
          organizationId: id,
          user: { isPlatformAdmin: false },
        },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
      this.prisma.usageRecord.aggregate({
        where: { organizationId: id, metricType: "STORAGE_GB" },
        _sum: { value: true },
      }),
      this.prisma.platformSupportSession.findFirst({
        where: { targetOrganizationId: id, endedAt: null },
        orderBy: { startedAt: "desc" },
        include: {
          user: {
            select: { id: true, email: true, firstName: true, lastName: true, isPlatformAdmin: true },
          },
        },
      }),
    ]);

    const planFeatures = (org.subscription?.plan?.features ?? {}) as Record<string, unknown>;
    const seatLimit =
      org.subscription?.seats ??
      (typeof planFeatures.maxUsers === "number"
        ? planFeatures.maxUsers
        : typeof planFeatures.users === "number"
          ? planFeatures.users
          : null);
    const storageLimitGb =
      typeof planFeatures.maxStorageGB === "number"
        ? planFeatures.maxStorageGB
        : typeof planFeatures.storage_gb === "number"
          ? planFeatures.storage_gb
          : null;
    const storageUsedGb = storageAgg._sum.value ? Number(storageAgg._sum.value) : 0;

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
      seatUsage: {
        used: org._count.memberships,
        limit: seatLimit,
      },
      lastLoginAt: lastSession?.createdAt ?? null,
      storage: {
        usedGb: storageUsedGb,
        limitGb: storageLimitGb,
      },
      monthlyUsage: {
        orders: ordersThisMonth,
        drivers: org._count.drivers,
        invoices: invoicesThisMonth,
      },
      activeSupportSession: activeSupport
        ? {
            id: activeSupport.id,
            startedAt: activeSupport.startedAt,
            status: "ACTIVE" as const,
            operator: {
              id: activeSupport.user.id,
              email: activeSupport.user.email,
              firstName: activeSupport.user.firstName,
              lastName: activeSupport.user.lastName,
              isPlatformAdmin: activeSupport.user.isPlatformAdmin,
            },
          }
        : null,
      subscription: org.subscription
        ? {
            id: org.subscription.id,
            status: org.subscription.status,
            currentPeriodEnd: org.subscription.currentPeriodEnd,
            trialEndsAt: org.subscription.trialEndsAt,
            seats: org.subscription.seats,
            plan: org.subscription.plan,
          }
        : null,
      members: org.memberships.map((m) => ({
        id: m.id,
        role: m.role,
        user: {
          id: m.user.id,
          email: m.user.email,
          firstName: m.user.firstName,
          lastName: m.user.lastName,
          isPlatformAdmin: m.user.isPlatformAdmin,
        },
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

    // If already supporting org A and opening B, keep the original home
    // membership (Platform Console home) — never re-home onto A.
    const previous = await this.prisma.platformSupportSession.findFirst({
      where: { userId: actor.userId, endedAt: null },
      orderBy: { startedAt: "desc" },
    });
    const homeMembershipId = previous?.homeMembershipId ?? actor.membershipId;

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

    if (previous) {
      await this.prisma.platformSupportSession.update({
        where: { id: previous.id },
        data: { endedAt: new Date() },
      });
      // Leaving org A (exit or switch-to-B) must revoke refresh tokens and
      // deactivate the temporary support ADMIN membership so the prior
      // access JWT dies immediately (membership status is re-checked on
      // every request) and slug-login cannot silently re-enter org A.
      await this.revokeSupportTenantAccess({
        userId: actor.userId,
        targetOrganizationId: previous.targetOrganizationId,
        targetMembershipId: previous.targetMembershipId,
        homeMembershipId: previous.homeMembershipId,
      });
      await this.audit.log({
        organizationId: previous.targetOrganizationId,
        actorUserId: actor.userId,
        action: "platform.support.exit",
        entityType: "Organization",
        entityId: previous.targetOrganizationId,
        metadata: {
          supportSessionId: previous.id,
          reason: "switched",
          nextOrganizationId: organizationId,
        },
      });
    } else {
      const orphaned = await this.prisma.platformSupportSession.findMany({
        where: { userId: actor.userId, endedAt: null },
        select: {
          targetOrganizationId: true,
          targetMembershipId: true,
          homeMembershipId: true,
        },
      });
      await this.prisma.platformSupportSession.updateMany({
        where: { userId: actor.userId, endedAt: null },
        data: { endedAt: new Date() },
      });
      for (const session of orphaned) {
        await this.revokeSupportTenantAccess({
          userId: actor.userId,
          targetOrganizationId: session.targetOrganizationId,
          targetMembershipId: session.targetMembershipId,
          homeMembershipId: session.homeMembershipId,
        });
      }
    }

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
      metadata: {
        supportSessionId: session.id,
        homeMembershipId,
        ...(previous
          ? { previousOrganizationId: previous.targetOrganizationId, switched: true }
          : {}),
      },
    });

    const auth = await this.auth.issueSessionForMembership(actor.userId, membership.id);
    return {
      ...auth,
      supportSession: {
        id: session.id,
        organizationId: org.id,
        organizationName: org.name,
        organizationSlug: org.slug,
        organizationStatus: org.status,
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

    await this.revokeSupportTenantAccess({
      userId: actor.userId,
      targetOrganizationId: active.targetOrganizationId,
      targetMembershipId: active.targetMembershipId,
      homeMembershipId: active.homeMembershipId,
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

  /// Closes every open Open ERP session for one operator and tears down the
  /// tenant-side credentials each of them minted. Used when the operator's own
  /// staff flag is revoked: `isPlatformAdmin` is read fresh on every request, so
  /// the moment it flips false JwtStrategy stops applying the support-session
  /// ownership rules — and the temporary tenant ADMIN membership Open ERP
  /// created would otherwise keep working as an ordinary membership.
  async endAllSupportSessions(userId: string): Promise<number> {
    const open = await this.prisma.platformSupportSession.findMany({
      where: { userId, endedAt: null },
      select: {
        targetOrganizationId: true,
        targetMembershipId: true,
        homeMembershipId: true,
      },
    });
    if (open.length === 0) return 0;

    await this.prisma.platformSupportSession.updateMany({
      where: { userId, endedAt: null },
      data: { endedAt: new Date() },
    });
    for (const session of open) {
      await this.revokeSupportTenantAccess({
        userId,
        targetOrganizationId: session.targetOrganizationId,
        targetMembershipId: session.targetMembershipId,
        homeMembershipId: session.homeMembershipId,
      });
    }
    return open.length;
  }

  /// Ends the tenant-side credentials minted for an Open ERP session:
  /// refresh tokens for the target org, and (when the target membership is
  /// not the operator's Platform Console home) the temporary ADMIN
  /// membership itself. Access JWTs are stateless, but JwtStrategy
  /// re-checks membership.status on every request — REMOVED makes the old
  /// bearer unusable immediately without a denylist.
  private async revokeSupportTenantAccess(args: {
    userId: string;
    targetOrganizationId: string;
    targetMembershipId: string;
    homeMembershipId: string;
  }): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: {
        userId: args.userId,
        organizationId: args.targetOrganizationId,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });

    if (args.targetMembershipId !== args.homeMembershipId) {
      await this.prisma.membership.updateMany({
        where: { id: args.targetMembershipId, status: "ACTIVE" },
        data: { status: "REMOVED" },
      });
    }
  }
}
