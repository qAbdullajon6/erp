import { IsDateString, IsIn, IsOptional } from "class-validator";
import { COMPARISON_PERIODS, type ComparisonPeriod } from "../../reports/dto/report-filter.dto";

/// Date-range + comparison-period shape for GET /dispatch/analytics.
///
/// Deliberately narrower than ReportFilterDto (no customer/driver/vehicle/city
/// filters) — this endpoint answers "how is dispatch operations performing over
/// a period", not "give me a filtered slice of orders". It reuses the SAME
/// comparison-period vocabulary and date-parsing (report-filters.util.ts) as
/// /reports/operations so "previous period" means the same thing everywhere in
/// the app — one definition, not two.
export class DispatchAnalyticsQueryDto {
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  /// Trends are the whole point of this endpoint's `trends` block, so this
  /// defaults to a real comparison rather than Reports' "none" default.
  @IsOptional()
  @IsIn(COMPARISON_PERIODS)
  comparisonPeriod: ComparisonPeriod = "previous_period";
}
