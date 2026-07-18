import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../../auth/guards/roles.guard";
import { Roles } from "../../auth/decorators/roles.decorator";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import type { CurrentUserPayload } from "../../auth/interfaces/current-user.interface";
import { SubscriptionService } from "./subscription.service";

/// Developer Portal subscription API - read-only endpoints for integrations.
///
/// Endpoints:
/// - GET /developer/subscription - current plan, status, features, limits
/// - GET /developer/subscription/feature - check if specific feature enabled
/// - GET /developer/subscription/quotas - usage and remaining quotas
/// - GET /developer/subscription/rate-limits - API rate limit info
///
/// All endpoints require organization member authentication.
/// Useful for third-party integrations checking their own subscription.
@Controller("developer/subscription")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN", "ACCOUNTANT", "DISPATCHER", "DRIVER")
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  @Get()
  async getCurrentSubscription(@CurrentUser() user: CurrentUserPayload) {
    return this.subscriptionService.getCurrentSubscription(user.organizationId);
  }

  @Get("feature")
  async checkFeature(
    @CurrentUser() user: CurrentUserPayload,
    @Query("name") featureName: string,
  ) {
    if (!featureName) {
      return { error: "Feature name required" };
    }

    const enabled = await this.subscriptionService.checkFeature(
      user.organizationId,
      featureName,
    );

    return {
      feature: featureName,
      enabled,
    };
  }

  @Get("quotas")
  async getQuotas(@CurrentUser() user: CurrentUserPayload) {
    return this.subscriptionService.getQuotas(user.organizationId);
  }

  @Get("rate-limits")
  async getRateLimits(@CurrentUser() user: CurrentUserPayload) {
    return this.subscriptionService.getRateLimits(user.organizationId);
  }
}
