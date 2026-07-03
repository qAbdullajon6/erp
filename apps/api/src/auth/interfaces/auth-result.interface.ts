import type { MembershipRole } from "@prisma/client";

/// Shape returned by register/login/refresh. Never includes passwordHash or
/// any other secret — only the raw refreshToken itself, which is the one
/// secret the client is actually meant to receive (and only this once; it's
/// never retrievable again, since only its hash is stored).
export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresInSeconds: number;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
  organization: {
    id: string;
    name: string;
    slug: string;
    defaultCurrency: string;
    timezone: string;
  };
  membership: {
    id: string;
    role: MembershipRole;
  };
}

export interface RequestContext {
  ip?: string;
}
