import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import type { Membership, Organization, User } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import type { AuthConfig } from "../config/configuration";
import { generateUniqueSlug } from "../organizations/slug.util";
import { PrismaService } from "../prisma/prisma.service";
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

@Injectable()
export class AuthService {
  private readonly authConfig: AuthConfig;

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
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
    const passwordValid = user?.passwordHash
      ? await this.passwordService.verify(dto.password, user.passwordHash)
      : false;

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
    if (!membership || membership.organization.status !== "ACTIVE") {
      throw new UnauthorizedException("Session is no longer valid");
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

    return {
      user: {
        id: membership.user.id,
        email: membership.user.email,
        firstName: membership.user.firstName,
        lastName: membership.user.lastName,
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

  /// Decides which of the user's Memberships becomes "current" for this
  /// login. If `organizationSlug` is given, it's validated against the
  /// user's real active Memberships — never trusted blindly. Otherwise
  /// defaults to their oldest active membership (deterministic, simple, and
  /// correct for the common case of a user belonging to exactly one org).
  private async resolveMembershipForLogin(
    userId: string,
    organizationSlug?: string,
  ): Promise<MembershipWithOrganization | null> {
    if (organizationSlug) {
      return this.prisma.membership.findFirst({
        where: {
          userId,
          status: "ACTIVE",
          organization: { slug: organizationSlug, status: "ACTIVE" },
        },
        include: { organization: true },
      });
    }

    return this.prisma.membership.findFirst({
      where: { userId, status: "ACTIVE", organization: { status: "ACTIVE" } },
      orderBy: { createdAt: "asc" },
      include: { organization: true },
    });
  }

  private async issueSession(
    user: User,
    membership: MembershipWithOrganization,
  ): Promise<AuthResult> {
    const payload: JwtPayload = { sub: user.id, mid: membership.id };
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
