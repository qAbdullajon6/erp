import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { SubscriptionPlanService } from "./subscription-plan.service";

/// Public and admin plan endpoints.
///
/// Public endpoints (no auth):
/// - GET /plans - List active plans (pricing page)
/// - GET /plans/:slug - Get plan by slug
///
/// Admin endpoints (ADMIN role):
/// - GET /plans/admin/all - List all plans (including inactive)
/// - GET /plans/:id/compare/:otherId - Compare two plans
///
/// Security: Public endpoints only show active plans. Admin endpoints
/// show all plans including inactive/custom.
@Controller("plans")
export class PlansController {
  constructor(private readonly planService: SubscriptionPlanService) {}

  /// List active plans (public endpoint for pricing page).
  /// No authentication required.
  @Get()
  async listActive() {
    const plans = await this.planService.listActivePlans();

    return {
      plans: plans.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        description: p.description,
        price: p.price,
        annualPrice: p.annualPrice,
        currency: p.currency,
        features: p.features,
        isFeatured: p.isFeatured,
      })),
    };
  }

  /// Get plan by slug (public endpoint).
  /// No authentication required.
  @Get(":slug")
  async getBySlug(@Param("slug") slug: string) {
    const plan = await this.planService.getPlanBySlug(slug);

    return {
      plan: {
        id: plan.id,
        name: plan.name,
        slug: plan.slug,
        description: plan.description,
        price: plan.price,
        annualPrice: plan.annualPrice,
        currency: plan.currency,
        features: plan.features,
        isFeatured: plan.isFeatured,
      },
    };
  }

  /// List all plans including inactive (admin-only).
  @Get("admin/all")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN")
  async listAll() {
    const plans = await this.planService.listAllPlans();

    return {
      plans: plans.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        description: p.description,
        price: p.price,
        annualPrice: p.annualPrice,
        currency: p.currency,
        features: p.features,
        isActive: p.isActive,
        isFeatured: p.isFeatured,
        sortOrder: p.sortOrder,
      })),
    };
  }

  /// Compare two plans (admin-only).
  @Get(":id/compare/:otherId")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN")
  async comparePlans(@Param("id") id: string, @Param("otherId") otherId: string) {
    const comparison = await this.planService.comparePlans(id, otherId);

    return {
      comparison,
    };
  }
}
