import "reflect-metadata";
import { ConfigService } from "@nestjs/config";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { configureApp } from "./app.config";
import type { AppConfig } from "./config/configuration";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Apply Helmet security headers before other middleware
  // Production-grade security headers: CSP, X-Frame-Options, HSTS, etc.
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // Allow inline styles for Tailwind/dynamic styling in UI
        styleSrc: ["'self'", "'unsafe-inline'"],
        // Allow scripts from self only
        scriptSrc: ["'self'"],
        // Allow images from self, data URIs (for charts), and HTTPS sources
        imgSrc: ["'self'", 'data:', 'https:'],
        // Allow fonts from self and data URIs
        fontSrc: ["'self'", 'data:'],
        // Allow connections to self (API calls)
        connectSrc: ["'self'"],
        // Block all plugins (Flash, Java, etc.)
        objectSrc: ["'none'"],
        // Require trusted types for DOM injection
        requireTrustedTypesFor: ["'script'"],
      },
    },
    // Enable HSTS (HTTP Strict Transport Security) for HTTPS enforcement
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true,
    },
    // Prevent MIME type sniffing
    noSniff: true,
    // Disable X-Powered-By header
    hidePoweredBy: true,
  }));

  configureApp(app);

  // Graceful shutdown: on SIGTERM/SIGINT (what `docker stop` and a rolling
  // deploy send) Nest runs every provider's onModuleDestroy/OnApplicationShutdown
  // before the process exits. That is what lets the in-process schedulers
  // (@nestjs/schedule crons — billing renewal, usage snapshots, the notification
  // delivery queue), open SSE streams, and the Prisma connection close cleanly
  // instead of being killed mid-flight. Without it a deploy can drop in-flight
  // work and leak connections. Registered before listen() so a signal that
  // arrives during startup is still honoured.
  app.enableShutdownHooks();

  const configService = app.get(ConfigService);
  const appConfig = configService.get<AppConfig>("app")!;

  await app.listen(appConfig.port);
}

// Wrap bootstrap in error handler to ensure startup failures are never silent.
// Without this, unhandled rejections during boot (port in use, config
// validation failure, Prisma schema mismatch) exit with cryptic
// "ExperimentalWarning" or no output, making deployment failures impossible
// to diagnose. This guarantees a structured log and explicit exit code.
bootstrap().catch((error) => {
  const logger = new Logger('Bootstrap');
  logger.error('FATAL: Application failed to start', error instanceof Error ? error.stack : error);
  process.exit(1);
});
