import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import type { MembershipRole } from "@prisma/client";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import type { CurrentUserPayload } from "../auth/interfaces/current-user.interface";
import { DispatchAnalyticsService } from "./dispatch-analytics.service";
import { DispatchService } from "./dispatch.service";
import { DispatchAnalyticsQueryDto } from "./dto/dispatch-analytics-query.dto";
import { DispatchAvailabilityQueryDto } from "./dto/dispatch-availability-query.dto";

/// "ACCOUNTANT: read-only orders and dispatch" per the phase spec; both
/// endpoints here are read-only anyway (mutations happen via Orders'
/// assign/status/cancel). SALES_CRM_MANAGER isn't mentioned for dispatch at
/// all — this module exposes operational driver/vehicle detail, which sales
/// isn't granted access to (same boundary as the Drivers/Vehicles modules).
const ROLES: MembershipRole[] = ["ADMIN", "OPERATIONS_MANAGER", "DISPATCHER", "ACCOUNTANT"];

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("dispatch")
export class DispatchController {
  constructor(
    private readonly dispatchService: DispatchService,
    private readonly dispatchAnalyticsService: DispatchAnalyticsService,
  ) {}

  @Roles(...ROLES)
  @Get("board")
  board(@CurrentUser() user: CurrentUserPayload) {
    return this.dispatchService.board(user.organizationId);
  }

  /// Real backend aggregation for the Dispatch Analytics dashboard — date-range
  /// scoped KPIs/trends/charts computed over the organization's full matching
  /// data, not a capped client-side slice. See DispatchAnalyticsService.
  @Roles(...ROLES)
  @Get("analytics")
  analytics(@Query() query: DispatchAnalyticsQueryDto, @CurrentUser() user: CurrentUserPayload) {
    return this.dispatchAnalyticsService.getAnalytics(user.organizationId, query);
  }

  @Roles(...ROLES)
  @Get("availability")
  availability(
    @Query() query: DispatchAvailabilityQueryDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.dispatchService.availability(user.organizationId, query);
  }
}
