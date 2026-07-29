import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import type { Membership, Organization, User } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import type { AuthConfig } from "../config/configuration";
import { generateUniqueSlug } from "../organizations/slug.util";
import { PrismaService } from "../prisma/prisma.service";
import { TrackingService } from "../telematics/tracking/tracking.service";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { LoginDto } from "./dto/login.dto";
import { RefreshDto } from "./dto/refresh.dto";
import { RegisterDto } from "./dto/register.dto";
import type { AuthResult, RequestContext } from "./interfaces/auth-result.interface";
import type { CurrentUserPayload } from "./interfaces/current-user.interface";
import type { JwtPayload } from "./interfaces/jwt-payload.interface";
import { PasswordService } from "./password.service";
import { generateRefreshToken, hashRefreshToken } from "./token.util";

type MembershipWithOrganization = Membership & { organization: Organization };

/// Not a real credential — a fixed argon2id hash verified against on
/// login when the email doesn't resolve to a user, so the "no such user"
/// path costs the same CPU time as a real wrong-password attempt. Pins the
/// login timing-safety fix to one place rather than recomputing a hash
/// inline.
const DUMMY_PASSWORD_HASH =
  "$argon2id$v=19$m=65536,t=3,p=4$+GJNCAmn3nE5tlkWjZ6tqQ$ktwl4Qpd4YFzcL1U/VfHqEmR7cV4DNQ+VAC3iB/fa5s";

@Injectable()
export class AuthService {
  private readonly authConfig: AuthConfig;

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
    private readonly tracking: TrackingService,
  ) {
    this.authConfig = this.configService.get<AuthConfig>("auth")!;
  }

  async register(dto: RegisterDto, context: RequestContext): Promise<AuthResult> {
    const email = dto.email.toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException("An account with this email already exists");
    }

    const passwordHash = await this.passwordService.hash(dto.password);
    const slug = await generateUniqueSlug(this.prisma, dto.organizationName);

    const { user, membership } = await this.prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: { name: dto.organizationName, slug },
      });
      const user = await tx.user.create({
        data: {
          email,
          firstName: dto.firstName,
          lastName: dto.lastName,
          passwordHash,
        },
      });
      const membership = await tx.membership.create({
        data: { organizationId: organization.id, userId: user.id, role: "ADMIN" },
        include: { organization: true },
      });
      // Create onboarding progress row for new organization
      await tx.onboardingProgress.create({
        data: {
          organizationId: organization.id,
          completed: false,
          skipped: false,
          steps: {
            organizationProfile: false,
            firstCustomer: false,
            firstDriver: false,
            firstVehicle: false,
            firstOrder: false,
          },
        },
      });
      return { user, membership };
    });

    await this.auditService.log({
      organizationId: membership.organizationId,
      actorUserId: user.id,
      action: "auth.register",
      entityType: "User",
      entityId: user.id,
      metadata: { ip: context.ip },
    });

    return this.issueSession(user, membership);
  }

  async login(dto: LoginDto, context: RequestContext): Promise<AuthResult> {
    const email = dto.email.toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    // Always pay the argon2 verify cost, even for an unknown email or a
    // user with no password set — otherwise the fast-reject path is
    // measurably faster than a real wrong-password attempt, turning login
    // latency into an email-enumeration oracle despite the identical error
    // message below.
    const passwordValid = await this.passwordService.verify(
      dto.password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );

    if (!user || !passwordValid) {
      await this.auditService.log({
        actorUserId: user?.id ?? null,
        action: "auth.login.failed",
        entityType: "User",
        entityId: user?.id ?? null,
        metadata: { email, ip: context.ip },
      });
      throw new UnauthorizedException("Invalid email or password");
    }

    if (user.status !== "ACTIVE") {
      throw new UnauthorizedException("This account is not active");
    }

    // Fresh login always starts outside Open ERP — close orphaned support
    // sessions and deactivate temporary tenant ADMIN memberships so a
    // platform operator cannot silently re-enter a previously supported
    // org via organizationSlug without a new platform.support.enter.
    if (user.isPlatformAdmin) {
      await this.endOrphanedPlatformSupport(user.id);
    }

    const membership = await this.resolveMembershipForLogin(user.id, dto.organizationSlug);
    if (!membership) {
      throw new UnauthorizedException("No active organization membership found for this account");
    }

    await this.auditService.log({
      organizationId: membership.organizationId,
      actorUserId: user.id,
      action: "auth.login",
      entityType: "User",
      entityId: user.id,
      metadata: { ip: context.ip },
    });

    return this.issueSession(user, membership);
  }

  async refresh(dto: RefreshDto, context: RequestContext): Promise<AuthResult> {
    const tokenHash = hashRefreshToken(dto.refreshToken);
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!existing || existing.revokedAt || existing.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException("Invalid or expired refresh token");
    }
    if (existing.user.status !== "ACTIVE") {
      throw new UnauthorizedException("This account is not active");
    }

    // Re-derive membership fresh rather than trusting anything cached, so a
    // role change or membership removal is respected on refresh too.
    const membership = await this.prisma.membership.findFirst({
      where: { userId: existing.userId, organizationId: existing.organizationId, status: "ACTIVE" },
      include: { organization: true },
    });
    if (!membership) {
      throw new UnauthorizedException("Session is no longer valid");
    }

    // Platform admins may refresh even when their home org is SUSPENDED —
    // otherwise suspending the seed/staff org locks them out of the console.
    // Tenant users still require an ACTIVE organization.
    if (membership.organization.status !== "ACTIVE" && !existing.user.isPlatformAdmin) {
      throw new UnauthorizedException("Session is no longer valid");
    }

    // Outside an active Open ERP session, refuse to refresh into anything
    // other than the Platform Console home membership (QA-C-02).
    if (existing.user.isPlatformAdmin) {
      const liveSupport = await this.prisma.platformSupportSession.findFirst({
        where: {
          userId: existing.userId,
          endedAt: null,
          targetMembershipId: membership.id,
          targetOrganizationId: membership.organizationId,
        },
        select: { id: true },
      });
      if (!liveSupport) {
        const latest = await this.prisma.platformSupportSession.findFirst({
          where: { userId: existing.userId },
          orderBy: { startedAt: "desc" },
          select: { homeMembershipId: true },
        });
        if (latest && membership.id !== latest.homeMembershipId) {
          throw new UnauthorizedException("Session is no longer valid");
        }
      }
    }

    // Rotate: the presented token is single-use.
    await this.prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    });

    await this.auditService.log({
      organizationId: membership.organizationId,
      actorUserId: existing.userId,
      action: "auth.refresh",
      entityType: "User",
      entityId: existing.userId,
      metadata: { ip: context.ip },
    });

    return this.issueSession(existing.user, membership);
  }

  async logout(dto: RefreshDto, currentUser: CurrentUserPayload): Promise<void> {
    const tokenHash = hashRefreshToken(dto.refreshToken);
    const existing = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (existing && existing.userId === currentUser.userId && !existing.revokedAt) {
      await this.prisma.refreshToken.update({
        where: { id: existing.id },
        data: { revokedAt: new Date() },
      });
    }

    await this.tracking
      .endSessionsForUser(currentUser.organizationId, currentUser.userId)
      .catch(() => undefined);

    await this.auditService.log({
      organizationId: currentUser.organizationId,
      actorUserId: currentUser.userId,
      action: "auth.logout",
      entityType: "User",
      entityId: currentUser.userId,
    });
  }

  async logoutAll(currentUser: CurrentUserPayload): Promise<{ revokedCount: number }> {
    const result = await this.prisma.refreshToken.updateMany({
      where: { userId: currentUser.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await this.tracking
      .endSessionsForUser(currentUser.organizationId, currentUser.userId)
      .catch(() => undefined);

    await this.auditService.log({
      organizationId: currentUser.organizationId,
      actorUserId: currentUser.userId,
      action: "auth.logout_all",
      entityType: "User",
      entityId: currentUser.userId,
      metadata: { revokedCount: result.count },
    });

    return { revokedCount: result.count };
  }

  async me(currentUser: CurrentUserPayload) {
    const membership = await this.prisma.membership.findUniqueOrThrow({
      where: { id: currentUser.membershipId },
      include: { user: true, organization: true },
    });

    const supportSession = membership.user.isPlatformAdmin
      ? await this.prisma.platformSupportSession.findFirst({
          where: { userId: membership.user.id, endedAt: null },
          include: {
            targetOrganization: {
              select: { id: true, name: true, slug: true, status: true },
            },
          },
          orderBy: { startedAt: "desc" },
        })
      : null;

    return {
      user: {
        id: membership.user.id,
        email: membership.user.email,
        firstName: membership.user.firstName,
        lastName: membership.user.lastName,
        // The web shell hides the Leads screen unless this is true. It is a
        // convenience for the UI only — PlatformAdminGuard is what actually
        // protects the data.
        isPlatformAdmin: membership.user.isPlatformAdmin,
      },
      organization: {
        id: membership.organization.id,
        name: membership.organization.name,
        slug: membership.organization.slug,
        defaultCurrency: membership.organization.defaultCurrency,
        timezone: membership.organization.timezone,
        status: membership.organization.status,
      },
      membership: {
        id: membership.id,
        role: membership.role,
      },
      supportSession: supportSession
        ? {
            id: supportSession.id,
            organizationId: supportSession.targetOrganization.id,
            organizationName: supportSession.targetOrganization.name,
            organizationSlug: supportSession.targetOrganization.slug,
            organizationStatus: supportSession.targetOrganization.status,
            startedAt: supportSession.startedAt,
          }
        : null,
    };
  }

  /// Used by Platform Console "Open ERP" / exit-support to mint a session for
  /// an already-resolved membership without going through login.
  async issueSessionForMembership(userId: string, membershipId: string): Promise<AuthResult> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const membership = await this.prisma.membership.findUniqueOrThrow({
      where: { id: membershipId },
      include: { organization: true },
    });
    if (membership.userId !== userId) {
      throw new UnauthorizedException("Membership does not belong to this user");
    }
    if (membership.status !== "ACTIVE") {
      throw new UnauthorizedException("Membership is not active");
    }
    return this.issueSession(user, membership);
  }

  async changePassword(dto: ChangePasswordDto, currentUser: CurrentUserPayload): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: currentUser.userId } });
    const currentValid = user.passwordHash
      ? await this.passwordService.verify(dto.currentPassword, user.passwordHash)
      : false;

    if (!currentValid) {
      throw new UnauthorizedException("Current password is incorrect");
    }

    const newHash = await this.passwordService.hash(dto.newPassword);
    await this.prisma.user.update({ where: { id: user.id }, data: { passwordHash: newHash } });

    // Force re-login on every device/session after a password change.
    await this.prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await this.auditService.log({
      organizationId: currentUser.organizationId,
      actorUserId: user.id,
      action: "auth.change_password",
      entityType: "User",
      entityId: user.id,
    });
  }

  /// Closes any live Open ERP rows for a platform operator and leaves only
  /// the Platform Console home membership ACTIVE. Temporary tenant ADMIN
  /// memberships from prior support sessions are REMOVED so organizationSlug
  /// login cannot silently re-enter a tenant without a new enter audit.
  private async endOrphanedPlatformSupport(userId: string): Promise<void> {
    const activeSessions = await this.prisma.platformSupportSession.findMany({
      where: { userId, endedAt: null },
      select: {
        targetOrganizationId: true,
        targetMembershipId: true,
        homeMembershipId: true,
      },
    });

    if (activeSessions.length > 0) {
      await this.prisma.platformSupportSession.updateMany({
        where: { userId, endedAt: null },
        data: { endedAt: new Date() },
      });
    }

    for (const session of activeSessions) {
      await this.prisma.refreshToken.updateMany({
        where: {
          userId,
          organizationId: session.targetOrganizationId,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
      if (session.targetMembershipId !== session.homeMembershipId) {
        await this.prisma.membership.updateMany({
          where: { id: session.targetMembershipId, status: "ACTIVE" },
          data: { status: "REMOVED" },
        });
      }
    }

    // Home = most recent support session's homeMembershipId (even if ended),
    // else the operator's oldest membership. Never deactivate that row —
    // historical sessions may have targeted it while a different org was
    // briefly recorded as home.
    const latestSession = await this.prisma.platformSupportSession.findFirst({
      where: { userId },
      orderBy: { startedAt: "desc" },
      select: { homeMembershipId: true },
    });
    const homeMembershipId =
      latestSession?.homeMembershipId ??
      (
        await this.prisma.membership.findFirst({
          where: { userId },
          orderBy: { createdAt: "asc" },
          select: { id: true },
        })
      )?.id;

    if (!homeMembershipId) return;

    await this.prisma.membership.updateMany({
      where: { userId, status: "ACTIVE", NOT: { id: homeMembershipId } },
      data: { status: "REMOVED" },
    });

    // Ensure the home seat itself is ACTIVE (recovers from a prior buggy sweep).
    await this.prisma.membership.updateMany({
      where: { id: homeMembershipId, status: { not: "ACTIVE" } },
      data: { status: "ACTIVE" },
    });
  }

  /// Decides which of the user's Memberships becomes "current" for this
  /// login. If `organizationSlug` is given, it's validated against the
  /// user's real active Memberships — never trusted blindly. Otherwise
  /// defaults to their oldest active membership (deterministic, simple, and
  /// correct for the common case of a user belonging to exactly one org).
  private async resolveMembershipForLogin(
    userId: string,
    organizationSlug?: string,
  ): Promise<MembershipWithOrganization | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isPlatformAdmin: true },
    });
    /// Platform staff must be able to sign in even if their home org was
    /// suspended (they need the console to restore it). Prefer ACTIVE orgs
    /// when any exist; otherwise allow SUSPENDED for platform admins only.
    const orgStatusFilter = user?.isPlatformAdmin
      ? { status: { in: ["ACTIVE" as const, "SUSPENDED" as const] }, deletedAt: null }
      : { status: "ACTIVE" as const };

    if (organizationSlug) {
      return this.prisma.membership.findFirst({
        where: {
          userId,
          status: "ACTIVE",
          organization: { slug: organizationSlug, ...orgStatusFilter },
        },
        include: { organization: true },
        orderBy: { organization: { status: "asc" } }, // ACTIVE before SUSPENDED
      });
    }

    // Prefer an ACTIVE org membership when available.
    const active = await this.prisma.membership.findFirst({
      where: { userId, status: "ACTIVE", organization: { status: "ACTIVE", deletedAt: null } },
      orderBy: { createdAt: "asc" },
      include: { organization: true },
    });
    if (active) return active;

    if (!user?.isPlatformAdmin) return null;

    return this.prisma.membership.findFirst({
      where: {
        userId,
        status: "ACTIVE",
        organization: { status: "SUSPENDED", deletedAt: null },
      },
      orderBy: { createdAt: "asc" },
      include: { organization: true },
    });
  }

  private async issueSession(
    user: User,
    membership: MembershipWithOrganization,
  ): Promise<AuthResult> {
    const payload: JwtPayload = { sub: user.id, mid: membership.id, typ: "staff" };
    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.authConfig.jwtAccessSecret,
      expiresIn: this.authConfig.jwtAccessExpiresInSeconds,
    });

    const rawRefreshToken = generateRefreshToken();
    const expiresAt = new Date(
      Date.now() + this.authConfig.refreshTokenExpiresInDays * 24 * 60 * 60 * 1000,
    );
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        organizationId: membership.organizationId,
        tokenHash: hashRefreshToken(rawRefreshToken),
        expiresAt,
      },
    });

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      accessTokenExpiresInSeconds: this.authConfig.jwtAccessExpiresInSeconds,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        isPlatformAdmin: user.isPlatformAdmin,
      },
      organization: {
        id: membership.organization.id,
        name: membership.organization.name,
        slug: membership.organization.slug,
        defaultCurrency: membership.organization.defaultCurrency,
        timezone: membership.organization.timezone,
      },
      membership: {
        id: membership.id,
        role: membership.role,
      },
    };
  }
}
