/**
 * Shared API-wide types. Mirrors apps/api/prisma/schema.prisma's MembershipRole
 * enum and apps/api/src/auth/interfaces/auth-result.interface.ts exactly — one
 * spelling of each, hand-kept in sync until the day this monorepo generates a
 * shared types package from the Prisma schema/OpenAPI spec (see final report,
 * "Future expansion").
 */
export type MembershipRole =
  | 'ADMIN'
  | 'OPERATIONS_MANAGER'
  | 'DISPATCHER'
  | 'ACCOUNTANT'
  | 'DRIVER'
  | 'SALES_CRM_MANAGER';

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

export interface AuthOrganization {
  id: string;
  name: string;
  slug: string;
  defaultCurrency: string;
  timezone: string;
}

export interface AuthMembership {
  id: string;
  role: MembershipRole;
}

/** Response shape of POST /auth/login, /auth/register, and /auth/refresh. */
export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresInSeconds: number;
  user: AuthUser;
  organization: AuthOrganization;
  membership: AuthMembership;
}

/** Response shape of GET /auth/me. */
export interface CurrentUserResult {
  user: AuthUser & { isPlatformAdmin: boolean };
  organization: AuthOrganization;
  membership: AuthMembership;
}
