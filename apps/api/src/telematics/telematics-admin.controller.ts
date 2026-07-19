import { Body, Controller, Get, Patch, Query, UseGuards } from "@nestjs/common";
import type { MembershipRole } from "@prisma/client";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import type { CurrentUserPayload } from "../auth/interfaces/current-user.interface";
import { TelematicsAnalyticsService } from "./analytics/telematics-analytics.service";
import { AnalyticsQueryDto } from "./dto/analytics-query.dto";
import { UpdateTelematicsSettingsDto } from "./dto/update-telematics-settings.dto";
import { TelematicsSettingsService } from "./settings/telematics-settings.service";

const OPS: MembershipRole[] = ["ADMIN", "OPERATIONS_MANAGER", "DISPATCHER"];
const ADMIN_OPS: MembershipRole[] = ["ADMIN", "OPERATIONS_MANAGER"];

/// Settings (tuning thresholds — admin/ops) and analytics (read — all ops
/// roles) for the telematics module.
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("telematics")
export class TelematicsAdminController {
  constructor(
    private readonly settings: TelematicsSettingsService,
    private readonly analytics: TelematicsAnalyticsService,
  ) {}

  @Roles(...ADMIN_OPS)
  @Get("settings")
  getSettings(@CurrentUser() user: CurrentUserPayload) {
    return this.settings.get(user.organizationId);
  }

  @Roles(...ADMIN_OPS)
  @Patch("settings")
  updateSettings(@Body() dto: UpdateTelematicsSettingsDto, @CurrentUser() user: CurrentUserPayload) {
    return this.settings.update(user.organizationId, dto);
  }

  @Roles(...OPS)
  @Get("analytics/overview")
  overview(@Query() query: AnalyticsQueryDto, @CurrentUser() user: CurrentUserPayload) {
    return this.analytics.overview(user.organizationId, query);
  }

  @Roles(...OPS)
  @Get("analytics/fleet-utilization")
  fleetUtilization(@Query() query: AnalyticsQueryDto, @CurrentUser() user: CurrentUserPayload) {
    return this.analytics.fleetUtilization(user.organizationId, query);
  }

  @Roles(...OPS)
  @Get("analytics/driver-behavior")
  driverBehavior(@Query() query: AnalyticsQueryDto, @CurrentUser() user: CurrentUserPayload) {
    return this.analytics.driverBehavior(user.organizationId, query);
  }

  @Roles(...OPS)
  @Get("analytics/fuel")
  fuel(@Query() query: AnalyticsQueryDto, @CurrentUser() user: CurrentUserPayload) {
    return this.analytics.fuelAnalytics(user.organizationId, query);
  }

  @Roles(...OPS)
  @Get("analytics/health")
  health(@Query() query: AnalyticsQueryDto, @CurrentUser() user: CurrentUserPayload) {
    return this.analytics.vehicleHealth(user.organizationId, query);
  }
}
