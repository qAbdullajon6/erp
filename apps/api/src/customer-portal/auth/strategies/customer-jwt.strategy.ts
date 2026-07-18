import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { CustomerPortalAccountStatus, CustomerStatus, OrganizationStatus } from "@prisma/client";
import type { AuthConfig } from "../../../config/configuration";
import { PrismaService } from "../../../prisma/prisma.service";
import type { CurrentCustomerPayload } from "../interfaces/current-customer.interface";
import type { CustomerJwtPayload } from "../interfaces/customer-jwt-payload.interface";

/// Stateless bearer-token strategy for the customer portal. Distinct from the
/// internal "jwt" strategy (which validates a User membership): this one
/// validates a CustomerPortalAccount and re-derives the live account/customer/
/// organization state on every request. A token issued before an account is
/// suspended is useless the instant it is next checked, because validation
/// here fails — not just at next login.
///
/// Shares the staff JWT secret (AuthConfig.jwtAccessSecret) rather than
/// minting a separate one — this is a deliberate, documented tradeoff: the
/// two token types are separated by strategy name and by `sub` resolving
/// against two disjoint, independently-generated UUID tables (User vs
/// CustomerPortalAccount), not by a distinct cryptographic key or an
/// audience/type claim. See docs/CUSTOMER_PORTAL_API.md's security section.
@Injectable()
export class CustomerJwtStrategy extends PassportStrategy(Strategy, "customer-jwt") {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<AuthConfig>("auth")!.jwtAccessSecret,
    });
  }

  async validate(payload: CustomerJwtPayload): Promise<CurrentCustomerPayload> {
    const account = await this.prisma.customerPortalAccount.findUnique({
      where: { id: payload.sub },
      include: { customer: true, organization: true },
    });

    if (!account || account.status !== CustomerPortalAccountStatus.ACTIVE) {
      throw new UnauthorizedException("Customer session is no longer valid");
    }
    if (account.customerId !== payload.cid) {
      throw new UnauthorizedException("Customer session is no longer valid");
    }
    if (account.customer.status !== CustomerStatus.ACTIVE) {
      throw new UnauthorizedException("Customer account is not active");
    }
    if (account.organization.status !== OrganizationStatus.ACTIVE) {
      throw new UnauthorizedException("Organization is not available");
    }

    return {
      accountId: account.id,
      customerId: account.customerId,
      organizationId: account.organizationId,
      email: account.email,
      companyName: account.customer.companyName,
    };
  }
}
