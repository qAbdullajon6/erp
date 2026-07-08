import { InvoiceStatus, OrderStatus } from "@prisma/client";
import { IsDateString, IsEnum, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength } from "class-validator";

export const COMPARISON_PERIODS = ["previous_period", "previous_year", "none"] as const;
export type ComparisonPeriod = (typeof COMPARISON_PERIODS)[number];

/// The one shared, allowlisted filter shape for every /reports/* endpoint.
/// Every field here is optional; omitting all of them still resolves to a
/// sensible default range (see report-filters.util.ts) so comparisonPeriod
/// is always meaningful even if the caller never specifies dates.
export class ReportFilterDto {
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsUUID()
  driverId?: string;

  @IsOptional()
  @IsUUID()
  vehicleId?: string;

  /// Matched case-insensitively as an exact city name, not a substring
  /// search — cities aren't a separate lookup table in this schema.
  @IsOptional()
  @IsString()
  @MaxLength(100)
  pickupCity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  deliveryCity?: string;

  @IsOptional()
  @IsEnum(OrderStatus)
  orderStatus?: OrderStatus;

  @IsOptional()
  @IsEnum(InvoiceStatus)
  invoiceStatus?: InvoiceStatus;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/, { message: "currency must be a 3-letter ISO 4217 code, e.g. USD" })
  currency?: string;

  /// IANA timezone name (e.g. "Asia/Tashkent"). Only affects how dates are
  /// bucketed into the time-series arrays — every stored timestamp is still
  /// a UTC instant; this just changes which calendar day/month it's
  /// attributed to for display. Defaults to the organization's own
  /// timezone if omitted.
  @IsOptional()
  @IsString()
  @MaxLength(100)
  timezone?: string;

  @IsOptional()
  @IsIn(COMPARISON_PERIODS)
  comparisonPeriod: ComparisonPeriod = "none";
}
