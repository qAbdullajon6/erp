import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { AuditModule } from "../audit/audit.module";
import { ApiKeysController } from "./api-keys/api-keys.controller";
import { ApiKeysService } from "./api-keys/api-keys.service";
import { WebhooksController } from "./webhooks/webhooks.controller";
import { WebhooksService } from "./webhooks/webhooks.service";
import { WebhookDispatcherService } from "./webhooks/webhook-dispatcher.service";
import { WebhookEventService } from "./webhooks/webhook-event.service";
import { UsageController } from "./usage/usage.controller";
import { UsageService } from "./usage/usage.service";
import { ApiKeyGuard } from "./guards/api-key.guard";
import { ApiKeyRateLimitGuard } from "./guards/api-key-rate-limit.guard";
import { ApiUsageMiddleware } from "./usage/api-usage.middleware";

/// The Developer Portal: the surface third parties integrate against, and the
/// screens an admin uses to manage that integration.
///
/// Imports only PrismaModule and AuditModule — deliberately no domain module.
/// Webhooks learn about domain events by being called from the existing event
/// fan-out (see WorkflowEventService), not by importing Orders/Dispatch/etc.
/// That keeps the dependency arrow pointing one way: domain modules may reach
/// this module, and this module never reaches back.
///
/// The guards are exported so any module can protect a route with API-key auth
/// without depending on this module's internals.
@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [ApiKeysController, WebhooksController, UsageController],
  providers: [
    ApiKeysService,
    WebhooksService,
    WebhookDispatcherService,
    WebhookEventService,
    UsageService,
    ApiKeyGuard,
    ApiKeyRateLimitGuard,
  ],
  exports: [WebhookEventService, ApiKeyGuard, ApiKeyRateLimitGuard, UsageService],
})
export class DeveloperModule implements NestModule {
  /// Metering is applied to the whole /v1 surface here rather than per
  /// controller, so a route added there is metered by existing, not by
  /// remembering to decorate it.
  ///
  /// The middleware itself no-ops on any request without an authenticated API
  /// key, so a wider path match than necessary is harmless — but /v1 is the
  /// only key-authenticated surface, and matching only it keeps the intent
  /// legible.
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(ApiUsageMiddleware).forRoutes("v1");
  }
}
