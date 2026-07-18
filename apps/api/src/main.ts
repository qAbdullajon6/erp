import "reflect-metadata";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { configureApp } from "./app.config";
import type { AppConfig } from "./config/configuration";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
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

void bootstrap();
