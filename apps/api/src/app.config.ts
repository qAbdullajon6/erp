import { INestApplication, ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { AllExceptionsFilter } from "./common/filters/http-exception.filter";
import { TransformInterceptor } from "./common/interceptors/transform.interceptor";
import type { AppConfig } from "./config/configuration";

/// Shared between main.ts's real bootstrap and e2e tests, so tests exercise
/// the exact same global pipes/filters/interceptors a real client sees —
/// Nest's TestingModule does NOT run main.ts, so without this, an e2e test
/// built directly from AppModule would silently skip all of this.
export function configureApp(app: INestApplication): void {
  const configService = app.get(ConfigService);
  const appConfig = configService.get<AppConfig>("app")!;

  app.enableCors({
    origin: appConfig.corsOrigins.length > 0 ? appConfig.corsOrigins : false,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  // The Reflector comes from the container rather than `new Reflector()` so the
  // interceptor reads the same metadata registry the decorators wrote to.
  app.useGlobalInterceptors(new TransformInterceptor(app.get(Reflector)));
}
