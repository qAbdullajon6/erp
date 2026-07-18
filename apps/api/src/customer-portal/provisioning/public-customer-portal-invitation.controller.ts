import { Body, Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { AcceptCustomerPortalInvitationDto } from "./dto/accept-customer-portal-invitation.dto";
import {
  CustomerPortalProvisioningService,
  type AcceptCustomerPortalInvitationResult,
  type ValidatedCustomerPortalInvitation,
} from "./customer-portal-provisioning.service";

/// Same reasoning and limit as PublicInvitationController: the only
/// unauthenticated customer-portal routes, so the surface an attacker would
/// probe. 256-bit tokens make guessing infeasible; this also caps password
/// submissions on /accept.
const INVITE_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

/// Public (unauthenticated) customer-portal invitation API: validate a token
/// to render the activation page, then accept it. No auth guards — the
/// invitee has no session yet. Acceptance issues no JWT/session — signing in
/// is the separate customer-portal login flow.
@Controller("customer-portal/invitations")
export class PublicCustomerPortalInvitationController {
  constructor(private readonly provisioning: CustomerPortalProvisioningService) {}

  /// Validate an invitation token for the activation page. 200 with safe
  /// invitation details; 404 if unknown/malformed; 410 if
  /// revoked/accepted/expired.
  @Throttle(INVITE_THROTTLE)
  @Get(":token")
  validate(@Param("token") token: string): Promise<ValidatedCustomerPortalInvitation> {
    return this.provisioning.validateInvitationToken(token);
  }

  /// Accept an invitation: create the CustomerPortalAccount and consume the
  /// invitation. 200 with { accountId, customerId, organizationId }; 400 on
  /// invalid body; 404 unknown/malformed token; 409 conflict; 410
  /// revoked/accepted/expired. Returns no token or session — the customer
  /// signs in separately.
  @Throttle(INVITE_THROTTLE)
  @Post("accept")
  @HttpCode(200)
  accept(
    @Body() dto: AcceptCustomerPortalInvitationDto,
  ): Promise<AcceptCustomerPortalInvitationResult> {
    return this.provisioning.acceptInvitation({ rawToken: dto.token, password: dto.password });
  }
}
