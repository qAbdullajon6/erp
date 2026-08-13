import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { randomUUID } from "crypto";
import type { Membership, Organization, User } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import type { AuthConfig, InvitationConfig } from "../config/configuration";
import { MailService } from "../mail/mail.service";
import { generateUniqueSlug } from "../organizations/slug.util";
import { PrismaService } from "../prisma/prisma.service";
import { TrackingService } from "../telematics/tracking/tracking.service";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { LoginDto } from "./dto/login.dto";
import { RefreshDto } from "./dto/refresh.dto";
import { RegisterDto } from "./dto/register.dto";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import { ValidateResetTokenDto } from "./dto/validate-reset-token.dto";
import type { AuthResult, RequestContext } from "./interfaces/auth-result.interface";
import type { CurrentUserPayload } from "./interfaces/current-user.interface";
import type { JwtPayload } from "./interfaces/jwt-payload.interface";
import { DUMMY_PASSWORD_HASH, PasswordService } from "./password.service";
import {
  generatePasswordResetToken,
  generateRefreshToken,
  hashPasswordResetToken,
  hashRefreshToken,
} from "./token.util";

type MembershipWithOrganization = Membership & { organization: Organization };

class RefreshTokenAlreadyConsumedError extends Error {}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly authConfig: AuthConfig;
  private readonly appPublicUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
    private readonly tracking: TrackingService,
    private readonly mailService: MailService,
  ) {
    this.authConfig = this.configService.get<AuthConfig>("auth")!;
    this.appPublicUrl = this.configService.get<InvitationConfig>("invitation")!.appPublicUrl;
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

    if (!user || !passwordValid || user.status !== "ACTIVE" || user.deletedAt) {
      await this.auditService.log({
        actorUserId: user?.id ?? null,
        action: "auth.login.failed",
        entityType: "User",
        entityId: user?.id ?? null,
        metadata: { email, ip: context.ip },
      });
      throw new UnauthorizedException("Invalid email or password");
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
      throw new UnauthorizedException("Invalid email or password");
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

    if (!existing || existing.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException("Invalid or expired refresh token");
    }
    if (existing.revokedAt) {
      await this.revokeRefreshFamily(existing.familyId, existing.userId, context);
      throw new UnauthorizedException("Invalid or expired refresh token");
    }
    if (existing.user.status !== "ACTIVE" || existing.user.deletedAt) {
      throw new UnauthorizedException("Invalid or expired refresh token");
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
    if (membership.organization.deletedAt) {
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

    const rawRefreshToken = generateRefreshToken();
    const refreshExpiresAt = this.refreshTokenExpiry();
    const accessToken = await this.signAccessToken(existing.user, membership);

    try {
      await this.prisma.$transaction(async (tx) => {
        // Conditional consume closes the double-refresh race: only one
        // concurrent request can rotate this row.
        const consumed = await tx.refreshToken.updateMany({
          where: { id: existing.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        if (consumed.count !== 1) {
          throw new RefreshTokenAlreadyConsumedError();
        }
        await tx.refreshToken.create({
          data: {
            userId: existing.userId,
            organizationId: existing.organizationId,
            familyId: existing.familyId,
            tokenHash: hashRefreshToken(rawRefreshToken),
            expiresAt: refreshExpiresAt,
          },
        });
      });
    } catch (error) {
      if (error instanceof RefreshTokenAlreadyConsumedError) {
        await this.revokeRefreshFamily(existing.familyId, existing.userId, context);
        throw new UnauthorizedException("Invalid or expired refresh token");
      }
      throw error;
    }

    await this.auditService.log({
      organizationId: membership.organizationId,
      actorUserId: existing.userId,
      action: "auth.refresh",
      entityType: "User",
      entityId: existing.userId,
      metadata: { ip: context.ip },
    });

    return this.toAuthResult(accessToken, rawRefreshToken, existing.user, membership);
  }

  async forgotPassword(dto: ForgotPasswordDto, context: RequestContext): Promise<void> {
    const startedAt = Date.now();
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });

    // The public response is deliberately identical for every branch.
    if (!user || user.status !== "ACTIVE" || user.deletedAt || !user.passwordHash) {
      await this.auditService.log({
        action: "auth.password_reset.requested",
        entityType: "User",
        metadata: { eligible: false, delivery: "not_attempted", ip: context.ip },
      });
      await this.ensureMinimumDuration(startedAt, 500);
      return;
    }

    const rawToken = generatePasswordResetToken();
    const expiresAt = new Date(
      Date.now() + this.authConfig.passwordResetExpiresInMinutes * 60 * 1000,
    );
    const now = new Date();
    const record = await this.prisma.$transaction(async (tx) => {
      await tx.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: now },
      });
      return tx.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: hashPasswordResetToken(rawToken),
          expiresAt,
        },
      });
    });

    const resetUrl = `${this.appPublicUrl.replace(/\/+$/, "")}/auth/reset-password?token=${encodeURIComponent(rawToken)}`;
    let delivery: "delivered" | "failed" = "delivered";
    try {
      await this.mailService.sendPasswordResetEmail({
        to: user.email,
        firstName: user.firstName,
        resetUrl,
        expiresAt,
      });
    } catch {
      // A token that was not delivered must not remain usable.
      await this.prisma.passwordResetToken.updateMany({
        where: { id: record.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      delivery = "failed";
      this.logger.error("Password reset email delivery failed; reset token invalidated");
    }

    await this.auditService.log({
      actorUserId: user.id,
      action: "auth.password_reset.requested",
      entityType: "User",
      entityId: user.id,
      metadata: { eligible: true, delivery, ip: context.ip },
    });
    await this.ensureMinimumDuration(startedAt, 500);
  }

  async validateResetToken(dto: ValidateResetTokenDto): Promise<{ valid: true }> {
    const record = await this.findActivePasswordResetToken(dto.token);
    if (!record) {
      throw new BadRequestException("Invalid or expired password reset link");
    }
    return { valid: true };
  }

  async resetPassword(dto: ResetPasswordDto, context: RequestContext): Promise<void> {
    const record = await this.findActivePasswordResetToken(dto.token);
    if (!record) {
      throw new BadRequestException("Invalid or expired password reset link");
    }

    const passwordHash = await this.passwordService.hash(dto.newPassword);
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.passwordResetToken.updateMany({
        where: {
          id: record.id,
          usedAt: null,
          expiresAt: { gt: now },
        },
        data: { usedAt: now },
      });
      if (consumed.count !== 1) {
        throw new BadRequestException("Invalid or expired password reset link");
      }
      await tx.user.update({
        where: { id: record.userId },
        data: {
          passwordHash,
          sessionVersion: { increment: 1 },
        },
      });
      await tx.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.passwordResetToken.updateMany({
        where: { userId: record.userId, usedAt: null },
        data: { usedAt: now },
      });
    });

    await this.auditService.log({
      actorUserId: record.userId,
      action: "auth.password_reset.completed",
      entityType: "User",
      entityId: record.userId,
      metadata: { ip: context.ip },
    });
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
    const [result] = await this.prisma.$transaction([
      this.prisma.refreshToken.updateMany({
        where: { userId: currentUser.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: currentUser.userId },
        data: { sessionVersion: { increment: 1 } },
      }),
    ]);

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
    if (user.status !== "ACTIVE" || user.deletedAt || membership.status !== "ACTIVE") {
      throw new UnauthorizedException("Membership is not active");
    }
    if (membership.organization.deletedAt) {
      throw new UnauthorizedException("Organization is not active");
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
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash: newHash,
          sessionVersion: { increment: 1 },
        },
      }),
      // Force re-login on every device/session after a password change.
      this.prisma.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: now },
      }),
      // A password change is how a user reacts to suspecting their account is
      // compromised, so any reset link already in flight has to die with the old
      // password. Otherwise an attacker who triggered "forgot password" earlier
      // still holds a valid credential-reset capability after the victim has
      // locked them out of every session.
      this.prisma.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: now },
      }),
    ]);

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
      : { status: "ACTIVE" as const, deletedAt: null };

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
    const accessToken = await this.signAccessToken(user, membership);
    const rawRefreshToken = generateRefreshToken();
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        organizationId: membership.organizationId,
        familyId: randomUUID(),
        tokenHash: hashRefreshToken(rawRefreshToken),
        expiresAt: this.refreshTokenExpiry(),
      },
    });

    return this.toAuthResult(accessToken, rawRefreshToken, user, membership);
  }

  private async signAccessToken(
    user: User,
    membership: MembershipWithOrganization,
  ): Promise<string> {
    const payload: JwtPayload = {
      sub: user.id,
      mid: membership.id,
      sv: user.sessionVersion,
      typ: "staff",
    };
    return this.jwtService.signAsync(payload, {
      secret: this.authConfig.jwtAccessSecret,
      expiresIn: this.authConfig.jwtAccessExpiresInSeconds,
    });
  }

  private refreshTokenExpiry(): Date {
    return new Date(
      Date.now() + this.authConfig.refreshTokenExpiresInDays * 24 * 60 * 60 * 1000,
    );
  }

  private toAuthResult(
    accessToken: string,
    rawRefreshToken: string,
    user: User,
    membership: MembershipWithOrganization,
  ): AuthResult {
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

  private async findActivePasswordResetToken(rawToken: string) {
    return this.prisma.passwordResetToken.findFirst({
      where: {
        tokenHash: hashPasswordResetToken(rawToken),
        usedAt: null,
        expiresAt: { gt: new Date() },
        user: {
          status: "ACTIVE",
          deletedAt: null,
        },
      },
      include: { user: true },
    });
  }

  private async revokeRefreshFamily(
    familyId: string,
    userId: string,
    context: RequestContext,
  ): Promise<void> {
    const revoked = await this.prisma.refreshToken.updateMany({
      where: { familyId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.auditService.log({
      actorUserId: userId,
      action: "auth.refresh.reuse_detected",
      entityType: "User",
      entityId: userId,
      metadata: { revokedCount: revoked.count, ip: context.ip },
    });
  }

  private async ensureMinimumDuration(startedAt: number, minimumMs: number): Promise<void> {
    const remaining = minimumMs - (Date.now() - startedAt);
    if (remaining > 0) {
      await new Promise((resolve) => setTimeout(resolve, remaining));
    }
  }
}
