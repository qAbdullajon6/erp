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

export default (): { app: AppConfig; auth: AuthConfig } => {
  const jwtAccessSecret = process.env.JWT_ACCESS_SECRET ?? "";

  // Fail fast and loudly rather than boot with an empty/guessable JWT
  // secret — that would let anyone forge a valid access token.
  if (!jwtAccessSecret) {
    throw new Error(
      "JWT_ACCESS_SECRET is not set. Copy apps/api/.env.example to apps/api/.env and set a real secret.",
    );
  }

  return {
    app: {
      port: parseInt(process.env.PORT ?? "4000", 10),
      nodeEnv: process.env.NODE_ENV ?? "development",
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
  };
};
