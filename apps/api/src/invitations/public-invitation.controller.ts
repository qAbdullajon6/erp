import { Body, Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { AcceptInvitationDto } from "./dto/accept-invitation.dto";
import {
  InvitationService,
  type AcceptInvitationResult,
  type ValidatedInvitation,
} from "./invitation.service";

/// Stricter than the global 300/min ceiling: these are the only unauthenticated
/// invitation routes, so they are the surface an attacker would probe. 256-bit
/// tokens make guessing infeasible, but this also caps password submissions on
/// /accept. Reuses the project's @Throttle decorator + global ThrottlerGuard —
/// no custom rate limiting.
const INVITE_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

/// Public (unauthenticated) invitation API the frontend calls before a session
/// exists: validate a token to render the accept page, then accept it. No auth
/// guards — the invitee has no session yet. Acceptance deliberately issues no
/// JWT/session/cookie; signing in is a separate flow. All state decisions
/// (expired/revoked/accepted/invalid) live in InvitationService; this controller
/// only delegates and lets the service's domain errors bubble through the global
/// exception filter.
@Controller("invite")
export class PublicInvitationController {
  constructor(private readonly invitationService: InvitationService) {}

  /// Validate an invitation token for the accept page. 200 with safe invitation
  /// details; 404 if unknown/malformed; 410 if revoked/accepted/expired.
  @Throttle(INVITE_THROTTLE)
  @Get(":token")
  validate(@Param("token") token: string): Promise<ValidatedInvitation> {
    return this.invitationService.validateInvitationToken(token);
  }

  /// Accept an invitation: provision the user + membership and consume the
  /// invitation. 200 with { userId, organizationId, role }; 400 on invalid body;
  /// 404 unknown/malformed token; 409 already a member / concurrent conflict;
  /// 410 revoked/accepted/expired. Returns no token or session — the user signs
  /// in separately.
  @Throttle(INVITE_THROTTLE)
  @Post("accept")
  @HttpCode(200)
  accept(@Body() dto: AcceptInvitationDto): Promise<AcceptInvitationResult> {
    return this.invitationService.acceptInvitation({
      rawToken: dto.token,
      firstName: dto.firstName,
      lastName: dto.lastName,
      password: dto.password,
    });
  }
}
