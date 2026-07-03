import "reflect-metadata";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { configureApp } from "./app.config";
import type { AppConfig } from "./config/configuration";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);

  const configService = app.get(ConfigService);
  const appConfig = configService.get<AppConfig>("app")!;

  await app.listen(appConfig.port);
}

void bootstrap();
