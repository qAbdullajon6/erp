/// Reports HTTP surface.
///
/// Intentional non-UI consumers (keep these endpoints even if Reports UI
/// does not expose every query param):
/// - `GET /reports/dashboard-summary` → Command Center (not the Reports page)
/// - `GET /reports/fleet-telematics` → Reports Fleet tab + OPS API clients
/// - Filter dims on ReportFilterDto (`customerId`, `driverId`, `vehicleId`,
///   cities, statuses, `currency`) → allowlisted for API/AI; Reports UI uses
///   date range + comparison + org default currency only
/// - AI Copilot `generate_report` → `ReportsService.executiveOverview`
import { Controller, ForbiddenException, Get, Query, Res, UseGuards } from "@nestjs/common";
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

/// Every non-DRIVER role can reach operational reports. Financial detail
/// and financial CSV export are ACCOUNTANT/ADMIN only — matching FINANCE_API.md.
const ROLES: MembershipRole[] = [
  "ADMIN",
  "OPERATIONS_MANAGER",
  "DISPATCHER",
  "ACCOUNTANT",
  "SALES_CRM_MANAGER",
];

const FINANCE_REPORT_ROLES: MembershipRole[] = ["ADMIN", "ACCOUNTANT"];

/// Matches telematics analytics controllers — do not widen via /reports.
const TELEMATICS_REPORT_ROLES: MembershipRole[] = ["ADMIN", "OPERATIONS_MANAGER", "DISPATCHER"];

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
  @Roles(...TELEMATICS_REPORT_ROLES)
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

  /// A lean, dashboard-specific projection — see ReportsService.dashboardSummary
  /// for why this exists instead of the Dashboard calling executive-overview +
  /// operations directly. No query params: the Dashboard's overview is always
  /// "right now, last 30 days," unlike the filterable Reports page.
  @Roles(...ROLES)
  @Get("dashboard-summary")
  dashboardSummary(@CurrentUser() user: CurrentUserPayload) {
    return this.reportsService.dashboardSummary(user.organizationId);
  }

  @Roles(...ROLES)
  @Get("operations")
  operations(@Query() query: ReportFilterDto, @CurrentUser() user: CurrentUserPayload) {
    return this.reportsService.operations(user.organizationId, query);
  }

  @Roles(...FINANCE_REPORT_ROLES)
  @Get("financial")
  financial(@Query() query: ReportFilterDto, @CurrentUser() user: CurrentUserPayload) {
    return this.reportsService.financial(user.organizationId, query);
  }

  /// Bypasses the global TransformInterceptor's `{ data }` envelope on
  /// purpose — a CSV download must be the raw file body, not JSON. Using
  /// `@Res()` (not `{ passthrough: true }`) tells Nest this handler owns
  /// the whole response; nothing else attempts to write to it afterward.
  /// Financial exports use the narrower ACCOUNTANT/ADMIN set.
  @Roles(...ROLES)
  @Get("export")
  async exportCsv(
    @Query() query: ExportReportQueryDto,
    @CurrentUser() user: CurrentUserPayload,
    @Res() res: Response,
  ): Promise<void> {
    if (query.type === "financial" && !FINANCE_REPORT_ROLES.includes(user.role)) {
      throw new ForbiddenException("Financial export requires ADMIN or ACCOUNTANT");
    }
    const { filename, csv } = await this.reportsService.exportCsv(user.organizationId, query);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);
  }
}
