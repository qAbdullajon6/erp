import { Controller, Get, Query, Res, UseGuards } from "@nestjs/common";
import type { MembershipRole } from "@prisma/client";
import type { Response } from "express";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import type { CurrentUserPayload } from "../auth/interfaces/current-user.interface";
import { ExportReportQueryDto } from "./dto/export-report-query.dto";
import { ReportFilterDto } from "./dto/report-filter.dto";
import { ReportsService } from "./reports.service";
import { TelematicsAnalyticsService } from "../telematics/analytics/telematics-analytics.service";
import { AnalyticsQueryDto } from "../telematics/dto/analytics-query.dto";

/// Every non-DRIVER role can reach every report in this phase — unlike
/// Notifications, reports aren't split by category, so there's no
/// row-level filtering to layer on top of the route guard. A future phase
/// could restrict e.g. the Financial report to ADMIN/ACCOUNTANT if needed;
/// not required by this phase's spec.
const ROLES: MembershipRole[] = [
  "ADMIN",
  "OPERATIONS_MANAGER",
  "DISPATCHER",
  "ACCOUNTANT",
  "SALES_CRM_MANAGER",
];

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("reports")
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly telematicsAnalytics: TelematicsAnalyticsService,
  ) {}

  /// Fleet telematics report — the same fleet-utilisation, driver-behaviour and
  /// fuel aggregates the telematics module computes, surfaced under /reports so
  /// they sit alongside the operations and financial reports. Delegates to the
  /// telematics analytics service rather than re-deriving anything.
  @Roles(...ROLES)
  @Get("fleet-telematics")
  async fleetTelematics(@Query() query: AnalyticsQueryDto, @CurrentUser() user: CurrentUserPayload) {
    const [overview, utilization, driverBehavior, fuel] = await Promise.all([
      this.telematicsAnalytics.overview(user.organizationId, query),
      this.telematicsAnalytics.fleetUtilization(user.organizationId, query),
      this.telematicsAnalytics.driverBehavior(user.organizationId, query),
      this.telematicsAnalytics.fuelAnalytics(user.organizationId, query),
    ]);
    return { overview, utilization, driverBehavior, fuel };
  }

  @Roles(...ROLES)
  @Get("executive-overview")
  executiveOverview(@Query() query: ReportFilterDto, @CurrentUser() user: CurrentUserPayload) {
    return this.reportsService.executiveOverview(user.organizationId, query);
  }

  @Roles(...ROLES)
  @Get("operations")
  operations(@Query() query: ReportFilterDto, @CurrentUser() user: CurrentUserPayload) {
    return this.reportsService.operations(user.organizationId, query);
  }

  @Roles(...ROLES)
  @Get("financial")
  financial(@Query() query: ReportFilterDto, @CurrentUser() user: CurrentUserPayload) {
    return this.reportsService.financial(user.organizationId, query);
  }

  /// Bypasses the global TransformInterceptor's `{ data }` envelope on
  /// purpose — a CSV download must be the raw file body, not JSON. Using
  /// `@Res()` (not `{ passthrough: true }`) tells Nest this handler owns
  /// the whole response; nothing else attempts to write to it afterward.
  @Roles(...ROLES)
  @Get("export")
  async exportCsv(
    @Query() query: ExportReportQueryDto,
    @CurrentUser() user: CurrentUserPayload,
    @Res() res: Response,
  ): Promise<void> {
    const { filename, csv } = await this.reportsService.exportCsv(user.organizationId, query);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);
  }
}
