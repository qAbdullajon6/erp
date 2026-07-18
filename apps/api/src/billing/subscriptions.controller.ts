import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { CurrentUserPayload } from "../auth/interfaces/current-user.interface";
import { SubscriptionLifecycleService } from "./subscription-lifecycle.service";
import { SubscriptionPlanService } from "./subscription-plan.service";
import { UsageMeteringService } from "./usage-metering.service";
import { BillingSeatsService } from "./billing-seats.service";
import {
  CreateSubscriptionDto,
  UpgradeSubscriptionDto,
  DowngradeSubscriptionDto,
  CancelSubscriptionDto,
  AddSeatsDto,
  GetUsageQueryDto,
} from "./dto/subscription.dto";

/// ADMIN-ONLY subscription management endpoints.
///
/// All endpoints require ADMIN role. Organization is derived from JWT
/// (user's active organization), never from client input - prevents cross-org access.
///
/// Endpoints:
/// - POST /subscriptions - Create subscription
/// - GET /subscriptions - Get current subscription
/// - POST /subscriptions/upgrade - Upgrade plan
/// - POST /subscriptions/downgrade - Downgrade plan
/// - POST /subscriptions/cancel - Cancel subscription
/// - POST /subscriptions/reactivate - Reactivate cancelled subscription
/// - POST /subscriptions/seats - Add seats
/// - GET /subscriptions/usage - Get usage summary
/// - GET /subscriptions/seats - Get seat summary
///
/// Security: All operations scoped to authenticated user's organization.
/// No cross-org access possible.
@Controller("subscriptions")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN")
export class SubscriptionsController {
  constructor(
    private readonly lifecycle: SubscriptionLifecycleService,
    private readonly planService: SubscriptionPlanService,
    private readonly usageMetering: UsageMeteringService,
    private readonly seatsService: BillingSeatsService,
  ) {}

  @Post()
  async create(@Body() dto: CreateSubscriptionDto, @CurrentUser() user: CurrentUserPayload) {
    const subscription = await this.lifecycle.createSubscription(user.organizationId, dto.planId, {
      trialDays: dto.trialDays,
      seats: dto.seats,
      paymentCustomerId: dto.paymentCustomerId,
      actor: user,
    });

    return {
      subscription: this.toResponse(subscription),
    };
  }

  @Get()
  async getCurrent(@CurrentUser() user: CurrentUserPayload) {
    const subscription = await this.lifecycle["getSubscription"](user.organizationId);
    return {
      subscription: this.toResponse(subscription),
    };
  }

  @Post("upgrade")
  async upgrade(@Body() dto: UpgradeSubscriptionDto, @CurrentUser() user: CurrentUserPayload) {
    const subscription = await this.lifecycle.upgradeSubscription(
      user.organizationId,
      dto.newPlanId,
      user,
    );

    return {
      subscription: this.toResponse(subscription),
    };
  }

  @Post("downgrade")
  async downgrade(@Body() dto: DowngradeSubscriptionDto, @CurrentUser() user: CurrentUserPayload) {
    const subscription = await this.lifecycle.downgradeSubscription(
      user.organizationId,
      dto.newPlanId,
      user,
      { immediate: dto.immediate },
    );

    return {
      subscription: this.toResponse(subscription),
      message: dto.immediate
        ? "Subscription downgraded immediately"
        : "Subscription downgrade scheduled for end of billing period",
    };
  }

  @Post("cancel")
  async cancel(@Body() dto: CancelSubscriptionDto, @CurrentUser() user: CurrentUserPayload) {
    const subscription = await this.lifecycle.cancelSubscription(user.organizationId, user, {
      immediate: dto.immediate,
      reason: dto.reason,
    });

    return {
      subscription: this.toResponse(subscription),
      message: dto.immediate
        ? "Subscription cancelled immediately"
        : "Subscription cancellation scheduled for end of billing period",
    };
  }

  @Post("reactivate")
  async reactivate(@CurrentUser() user: CurrentUserPayload) {
    const subscription = await this.lifecycle.reactivateSubscription(user.organizationId, user);

    return {
      subscription: this.toResponse(subscription),
      message: "Subscription reactivated successfully",
    };
  }

  @Post("seats")
  async addSeats(@Body() dto: AddSeatsDto, @CurrentUser() user: CurrentUserPayload) {
    const subscription = await this.lifecycle.addSeats(user.organizationId, dto.count, user);

    return {
      subscription: this.toResponse(subscription),
      message: `Added ${dto.count} seats successfully`,
    };
  }

  @Get("usage")
  async getUsage(@CurrentUser() user: CurrentUserPayload) {
    const summary = await this.usageMetering.getUsageSummary(user.organizationId);

    return {
      usage: summary,
    };
  }

  @Get("seats")
  async getSeats(@CurrentUser() user: CurrentUserPayload) {
    const summary = await this.seatsService.getSeatSummary(user.organizationId);

    return {
      seats: summary,
    };
  }

  @Get("history")
  async getHistory(@CurrentUser() user: CurrentUserPayload) {
    const subscription = await this.lifecycle["getSubscription"](user.organizationId);

    // Access SubscriptionHistory via subscription relation
    const history = await this.lifecycle["prisma"].subscriptionHistory.findMany({
      where: { subscriptionId: subscription.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        fromPlan: true,
        toPlan: true,
        actor: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    return {
      history: history.map((h) => ({
        id: h.id,
        eventType: h.eventType,
        fromPlan: h.fromPlan ? { id: h.fromPlan.id, name: h.fromPlan.name } : null,
        toPlan: h.toPlan ? { id: h.toPlan.id, name: h.toPlan.name } : null,
        effectiveDate: h.effectiveDate,
        reason: h.reason,
        actor: h.actor
          ? {
              id: h.actor.id,
              name: `${h.actor.firstName} ${h.actor.lastName}`,
              email: h.actor.email,
            }
          : null,
        createdAt: h.createdAt,
      })),
    };
  }

  private toResponse(subscription: any) {
    return {
      id: subscription.id,
      organizationId: subscription.organizationId,
      plan: {
        id: subscription.plan.id,
        name: subscription.plan.name,
        slug: subscription.plan.slug,
        price: subscription.plan.price,
        currency: subscription.plan.currency,
      },
      status: subscription.status,
      seats: subscription.seats,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      trialEndsAt: subscription.trialEndsAt,
      cancelAt: subscription.cancelAt,
      cancelledAt: subscription.cancelledAt,
      cancellationReason: subscription.cancellationReason,
      autoRenew: subscription.autoRenew,
      createdAt: subscription.createdAt,
      updatedAt: subscription.updatedAt,
    };
  }
}
