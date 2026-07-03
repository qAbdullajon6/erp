export interface AppConfig {
  port: number;
  nodeEnv: string;
  corsOrigins: string[];
  databaseUrl: string;
}

export default (): { app: AppConfig } => ({
  app: {
    port: parseInt(process.env.PORT ?? "4000", 10),
    nodeEnv: process.env.NODE_ENV ?? "development",
    corsOrigins: (process.env.CORS_ORIGIN ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
    databaseUrl: process.env.DATABASE_URL ?? "",
  },
});
