import { IsISO8601, IsOptional, IsString } from "class-validator";

/// Date-range filter shared by the analytics endpoints. Both bounds optional;
/// the service applies a sane default window (last 30 days) when omitted, the
/// same convention the Reports module uses.
export class AnalyticsQueryDto {
  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @IsString()
  vehicleId?: string;

  @IsOptional()
  @IsString()
  driverId?: string;
}
