import { Injectable, NotImplementedException } from "@nestjs/common";
import { PasswordService } from "./password.service";

/// Interface-only for this phase — see docs/BACKEND_FOUNDATION.md for the
/// full planned auth flow. Every method here is a documented placeholder
/// for the next auth phase, not a working implementation: each rejects with
/// NotImplementedException rather than silently pretending to succeed.
/// No controller exposes these over HTTP yet, and the frontend does not
/// call this API in this phase.
@Injectable()
export class AuthService {
  constructor(private readonly passwordService: PasswordService) {}

  /// Planned: create a User (hashing the password via PasswordService),
  /// optionally creating or joining an Organization via a Membership.
  // eslint-disable-next-line @typescript-eslint/require-await
  async register(): Promise<never> {
    throw new NotImplementedException("register() is a planned-auth-phase placeholder");
  }

  /// Planned: verify email + password via PasswordService.verify(), then
  /// issue a short-lived access token plus a refresh token (persisted, as a
  /// hash, in the RefreshToken table).
  // eslint-disable-next-line @typescript-eslint/require-await
  async login(): Promise<never> {
    throw new NotImplementedException("login() is a planned-auth-phase placeholder");
  }

  /// Planned: validate a presented refresh token against its stored hash,
  /// reject if revoked/expired, then rotate it and issue a new access token.
  // eslint-disable-next-line @typescript-eslint/require-await
  async refreshAccessToken(): Promise<never> {
    throw new NotImplementedException("refreshAccessToken() is a planned-auth-phase placeholder");
  }

  /// Planned: once a user is authenticated, let them pick which
  /// Organization (via their Memberships) the current session acts within —
  /// every subsequent request is then scoped to that organizationId.
  // eslint-disable-next-line @typescript-eslint/require-await
  async selectOrganization(): Promise<never> {
    throw new NotImplementedException("selectOrganization() is a planned-auth-phase placeholder");
  }
}
