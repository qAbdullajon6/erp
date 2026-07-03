/// What's actually signed into the access token. Deliberately minimal —
/// organizationId and role are NOT included here; JwtStrategy re-derives
/// them fresh from the Membership row on every request, so a role change or
/// membership removal takes effect immediately instead of waiting for the
/// (short-lived) access token to expire.
export interface JwtPayload {
  /// userId
  sub: string;
  /// membershipId — identifies which organization this session is scoped to
  mid: string;
}
