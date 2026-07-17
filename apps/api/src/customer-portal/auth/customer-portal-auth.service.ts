import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { CustomerPortalAccountStatus, CustomerStatus, OrganizationStatus, type Prisma } from "@prisma/client";
import type { AuthConfig } from "../../config/configuration";
import { AuditService } from "../../audit/audit.service";
import { isRefreshTokenActive } from "../../common/refresh-token.util";
import { PrismaService } from "../../prisma/prisma.service";
import { PasswordService } from "../../auth/password.service";
import type { CurrentCustomerPayload } from "./interfaces/current-customer.interface";
import {
  CustomerAuthResponse,
  CustomerPortalCustomerPayload,
} from "./dto/auth-response.interface";
import { CustomerPortalChangePasswordDto } from "./dto/change-password.dto";
import { CustomerPortalLoginDto } from "./dto/login.dto";
import { CustomerPortalRefreshDto } from "./dto/refresh.dto";
import {
  customerRefreshTokenExpiry,
  generateCustomerRefreshToken,
  hashCustomerRefreshToken,
} from "./customer-token.util";

type AccountWithRelations = Prisma.CustomerPortalAccountGetPayload<{
  include: { customer: true; organization: true };
}>;

@Injectable()
export class CustomerPortalAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly passwordService: PasswordService,
    private readonly configService: ConfigService,
    private readonly audit: AuditService,
  ) {}

  async login(dto: CustomerPortalLoginDto): Promise<CustomerAuthResponse> {
    const email = dto.email.trim().toLowerCase();
    const account = await this.resolveAccountForLogin(email, dto.organizationSlug);

    if (!account) {
      throw new UnauthorizedException("Invalid email or password");
    }

    const passwordOk = await this.passwordService.verify(dto.password, account.passwordHash);

    if (
      !passwordOk ||
      account.status !== CustomerPortalAccountStatus.ACTIVE ||
      account.customer.status !== CustomerStatus.ACTIVE ||
      account.organization.status !== OrganizationStatus.ACTIVE
    ) {
      await this.audit
        .log({
          organizationId: account.organizationId,
          actorUserId: null,
          action: "CUSTOMER_PORTAL_LOGIN_FAILED",
          entityType: "CUSTOMER_PORTAL",
          entityId: account.customerId,
          metadata: { email },
        })
        .catch(() => undefined);
      throw new UnauthorizedException("Invalid email or password");
    }

    const authConfig = this.configService.get<AuthConfig>("auth")!;
    const accessToken = this.jwtService.sign({
      sub: account.id,
      cid: account.customerId,
    });
    const refreshToken = generateCustomerRefreshToken();
    const tokenHash = hashCustomerRefreshToken(refreshToken);
    const expiresAt = customerRefreshTokenExpiry(authConfig.refreshTokenExpiresInDays);

    await this.prisma.customerRefreshToken.create({
      data: {
        accountId: account.id,
        organizationId: account.organizationId,
        tokenHash,
        expiresAt,
      },
    });
    await this.prisma.customerPortalAccount.update({
      where: { id: account.id },
      data: { lastLoginAt: new Date() },
    });

    await this.audit
      .log({
        organizationId: account.organizationId,
        actorUserId: null,
        action: "CUSTOMER_PORTAL_LOGIN",
        entityType: "CUSTOMER_PORTAL",
        entityId: account.customerId,
        metadata: { email },
      })
      .catch(() => undefined);

    return {
      accessToken,
      refreshToken,
      accessTokenExpiresInSeconds: authConfig.jwtAccessExpiresInSeconds,
      customer: this.toCustomerPayload(account),
    };
  }

  async refresh(dto: CustomerPortalRefreshDto): Promise<CustomerAuthResponse> {
    const tokenHash = hashCustomerRefreshToken(dto.refreshToken);
    const record = await this.prisma.customerRefreshToken.findUnique({
      where: { tokenHash },
      include: { account: { include: { customer: true, organization: true } } },
    });

    if (
      !record ||
      !isRefreshTokenActive(record) ||
      record.account.status !== CustomerPortalAccountStatus.ACTIVE ||
      record.account.customer.status !== CustomerStatus.ACTIVE ||
      record.account.organization.status !== OrganizationStatus.ACTIVE
    ) {
      throw new UnauthorizedException("Invalid or expired refresh token");
    }

    const authConfig = this.configService.get<AuthConfig>("auth")!;
    const accessToken = this.jwtService.sign({
      sub: record.account.id,
      cid: record.account.customerId,
    });
    const newRefresh = generateCustomerRefreshToken();
    const newHash = hashCustomerRefreshToken(newRefresh);
    const expiresAt = customerRefreshTokenExpiry(authConfig.refreshTokenExpiresInDays);

    await this.prisma.$transaction([
      this.prisma.customerRefreshToken.update({
        where: { id: record.id },
        data: { revokedAt: new Date() },
      }),
      this.prisma.customerRefreshToken.create({
        data: {
          accountId: record.accountId,
          organizationId: record.organizationId,
          tokenHash: newHash,
          expiresAt,
        },
      }),
    ]);

    return {
      accessToken,
      refreshToken: newRefresh,
      accessTokenExpiresInSeconds: authConfig.jwtAccessExpiresInSeconds,
      customer: this.toCustomerPayload(record.account),
    };
  }

  async logout(accountId: string, refreshToken: string): Promise<void> {
    const tokenHash = hashCustomerRefreshToken(refreshToken);
    await this.prisma.customerRefreshToken.updateMany({
      where: { accountId, tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async changePassword(
    payload: CurrentCustomerPayload,
    dto: CustomerPortalChangePasswordDto,
  ): Promise<void> {
    const account = await this.prisma.customerPortalAccount.findUnique({
      where: { id: payload.accountId },
    });
    if (!account) {
      throw new UnauthorizedException();
    }

    const currentOk = await this.passwordService.verify(dto.currentPassword, account.passwordHash);
    if (!currentOk) {
      throw new BadRequestException("Current password is incorrect");
    }

    const passwordHash = await this.passwordService.hash(dto.newPassword);
    await this.prisma.customerPortalAccount.update({
      where: { id: account.id },
      data: { passwordHash },
    });

    // Password change is a credential compromise recovery point: revoke every
    // other active session so a leaked refresh token stops working the moment
    // the customer changes their password, matching the staff
    // change-password flow's own session-revocation behavior.
    await this.prisma.customerRefreshToken.updateMany({
      where: { accountId: account.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await this.audit
      .log({
        organizationId: payload.organizationId,
        actorUserId: null,
        action: "CUSTOMER_PORTAL_PASSWORD_CHANGED",
        entityType: "CUSTOMER_PORTAL",
        entityId: payload.customerId,
        metadata: {},
      })
      .catch(() => undefined);
  }

  getSession(payload: CurrentCustomerPayload): {
    customer: CustomerPortalCustomerPayload & { accountId: string };
  } {
    return {
      customer: {
        accountId: payload.accountId,
        id: payload.customerId,
        companyName: payload.companyName,
        contactName: null,
        email: payload.email,
      },
    };
  }

  /// Resolves the account a login attempt should check against.
  ///
  /// Fixed from the originally recovered version, which resolved an
  /// arbitrary "first ACTIVE organization" when `organizationSlug` was
  /// omitted and only then looked for a matching account — meaning login
  /// silently failed for almost every customer in any database with more
  /// than one organization, regardless of how correct their credentials
  /// were. This version instead searches for the email directly across every
  /// organization:
  ///   - `organizationSlug` given -> scope to that one organization only.
  ///   - omitted, exactly one account matches the email -> use it (the
  ///     common case, and what the DTO's own documented intent describes).
  ///   - omitted, more than one account matches -> ask the customer to
  ///     disambiguate rather than guessing which one they meant.
  private async resolveAccountForLogin(
    email: string,
    organizationSlug: string | undefined,
  ): Promise<AccountWithRelations | null> {
    if (organizationSlug) {
      const organization = await this.prisma.organization.findFirst({
        where: { status: OrganizationStatus.ACTIVE, slug: organizationSlug },
      });
      if (!organization) {
        return null;
      }
      return this.prisma.customerPortalAccount.findFirst({
        where: { organizationId: organization.id, email: { equals: email, mode: "insensitive" } },
        include: { customer: true, organization: true },
      });
    }

    const candidates = await this.prisma.customerPortalAccount.findMany({
      where: { email: { equals: email, mode: "insensitive" } },
      include: { customer: true, organization: true },
    });

    if (candidates.length > 1) {
      throw new UnauthorizedException(
        "This email is registered with more than one organization. Please specify your organization to sign in.",
      );
    }

    return candidates[0] ?? null;
  }

  private toCustomerPayload(account: {
    customerId: string;
    email: string;
    customer: { companyName: string; contactName: string | null };
  }): CustomerPortalCustomerPayload {
    return {
      id: account.customerId,
      companyName: account.customer.companyName,
      contactName: account.customer.contactName,
      email: account.email,
    };
  }
}
