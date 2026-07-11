export interface AppConfig {
  port: number;
  nodeEnv: string;
  corsOrigins: string[];
  databaseUrl: string;
}

export interface AuthConfig {
  jwtAccessSecret: string;
  /// Seconds, not a duration string — @nestjs/jwt's newer typings want
  /// `expiresIn` as a number (interpreted as seconds) or a template-literal
  /// "StringValue" type from the `ms` package; a plain string doesn't
  /// satisfy either, so this is a number end-to-end to sidestep that.
  jwtAccessExpiresInSeconds: number;
  refreshTokenExpiresInDays: number;
}

export interface InvitationConfig {
  /// Base URL of the frontend (the origin the browser loads), used later to
  /// build the invitation accept link, e.g.
  /// `${appPublicUrl}/auth/accept-invite?token=...`. Required in production —
  /// an empty value there produces dead invite links.
  appPublicUrl: string;
  /// How long an invitation stays valid, in days. A positive integer; expiry
  /// (Invitation.expiresAt) is derived from this when an invite is sent.
  expiresInDays: number;
  /// Optional SMTP transport placeholders, wired up in the mail phase. Absent
  /// (undefined) means no real transport is configured, so the mail layer
  /// falls back to logging the link in development. SMTP_URL may embed
  /// credentials — it is read here but never logged.
  smtpUrl?: string;
  mailFrom?: string;
}

export default (): { app: AppConfig; auth: AuthConfig; invitation: InvitationConfig } => {
  const nodeEnv = process.env.NODE_ENV ?? "development";
  const jwtAccessSecret = process.env.JWT_ACCESS_SECRET ?? "";

  // Fail fast and loudly rather than boot with an empty/guessable JWT
  // secret — that would let anyone forge a valid access token.
  if (!jwtAccessSecret) {
    throw new Error(
      "JWT_ACCESS_SECRET is not set. Copy apps/api/.env.example to apps/api/.env and set a real secret.",
    );
  }

  // Only required in production: locally and in tests the browser loads the web
  // app from Vite on :3000, and no invitation email is actually sent.
  const appPublicUrl = process.env.APP_PUBLIC_URL ?? "";
  if (nodeEnv === "production" && !appPublicUrl) {
    throw new Error(
      "APP_PUBLIC_URL is not set. It is required in production to build invitation links, e.g. https://app.flowerp.uz",
    );
  }

  const invitationExpiresInDays = parseInt(process.env.INVITATION_EXPIRES_IN_DAYS ?? "7", 10);
  if (!Number.isInteger(invitationExpiresInDays) || invitationExpiresInDays <= 0) {
    throw new Error(
      "INVITATION_EXPIRES_IN_DAYS must be a positive integer number of days (default 7).",
    );
  }

  return {
    app: {
      port: parseInt(process.env.PORT ?? "4000", 10),
      nodeEnv,
      corsOrigins: (process.env.CORS_ORIGIN ?? "")
        .split(",")
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
      databaseUrl: process.env.DATABASE_URL ?? "",
    },
    auth: {
      jwtAccessSecret,
      jwtAccessExpiresInSeconds: parseInt(process.env.JWT_ACCESS_EXPIRES_IN_SECONDS ?? "900", 10),
      refreshTokenExpiresInDays: parseInt(process.env.REFRESH_TOKEN_EXPIRES_IN_DAYS ?? "30", 10),
    },
    invitation: {
      appPublicUrl,
      expiresInDays: invitationExpiresInDays,
      // Empty string -> undefined, so the mail layer can treat "no transport
      // configured" as a simple presence check.
      smtpUrl: process.env.SMTP_URL || undefined,
      mailFrom: process.env.MAIL_FROM || undefined,
    },
  };
};
