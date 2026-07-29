import { ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { PrismaService } from "../../prisma/prisma.service";
import type { AuthConfig } from "../../config/configuration";
import type { JwtPayload } from "../interfaces/jwt-payload.interface";
import type { CurrentUserPayload } from "../interfaces/current-user.interface";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const authConfig = configService.get<AuthConfig>("auth")!;
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: authConfig.jwtAccessSecret,
    });
  }

  /// Re-checks the membership/user/organization are all still active on
  /// every single request — a revoked membership or disabled user is
  /// rejected immediately, without waiting for the access token to expire.
  async validate(payload: JwtPayload): Promise<CurrentUserPayload> {
    const membership = await this.prisma.membership.findUnique({
      where: { id: payload.mid },
      include: { user: true, organization: true },
    });

    if (!membership || membership.userId !== payload.sub) {
      throw new UnauthorizedException("Invalid session");
    }
    if (membership.status !== "ACTIVE") {
      throw new UnauthorizedException("Membership is no longer active");
    }
    if (membership.user.status !== "ACTIVE") {
      throw new UnauthorizedException("User account is not active");
    }
    if (membership.organization.status !== "ACTIVE") {
      // Platform staff keep a JWT tied to a "home" membership for Platform
      // Console work. Suspending that org must NOT lock them out of restoring
      // it — only non-staff tenants are blocked when their org is inactive.
      // Open ERP into a suspended customer org is also allowed (support mode).
      if (!membership.user.isPlatformAdmin) {
        throw new UnauthorizedException("Organization is not active");
      }
    }

    // Support-session ownership: while Open ERP is active, the JWT membership
    // MUST be the support target. A stale token for the home org or another
    // customer org must not silently read/write the wrong tenant — and must
    // not auto-close the live support session either.
    if (membership.user.isPlatformAdmin) {
      const support = await this.prisma.platformSupportSession.findFirst({
        where: { userId: membership.userId, endedAt: null },
        orderBy: { startedAt: "desc" },
        select: {
          targetMembershipId: true,
          targetOrganizationId: true,
        },
      });
      if (
        support &&
        (membership.id !== support.targetMembershipId ||
          membership.organizationId !== support.targetOrganizationId)
      ) {
        throw new ForbiddenException(
          "Support session does not match this organization. Exit support or re-enter the correct organization.",
        );
      }
    }

    return {
      userId: membership.userId,
      membershipId: membership.id,
      organizationId: membership.organizationId,
      role: membership.role,
      email: membership.user.email,
      // Read fresh from the user row like everything else here, so revoking
      // staff access takes effect on the next request rather than whenever the
      // access token happens to expire.
      isPlatformAdmin: membership.user.isPlatformAdmin,
    };
  }
}
