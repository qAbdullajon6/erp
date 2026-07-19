import { IsBoolean, IsInt, IsNumber, IsOptional, Max, Min } from "class-validator";

/// Every field optional — a settings patch. Ranges keep an operator from
/// setting a nonsensical threshold (a 0 km/h speed limit, a negative idle
/// window) that would make every ping an alert or none.
export class UpdateTelematicsSettingsDto {
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(300)
  speedLimitKph?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(50)
  speedingToleranceKph?: number;

  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(7_200)
  idleThresholdSec?: number;

  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(7_200)
  stopThresholdSec?: number;

  @IsOptional()
  @IsInt()
  @Min(60)
  @Max(86_400)
  offlineThresholdSec?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(15)
  harshAccelMs2?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(15)
  harshBrakeMs2?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(15)
  harshCornerMs2?: number;

  @IsOptional()
  @IsInt()
  @Min(60)
  @Max(86_400)
  tripAutoCloseSec?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  lowFuelThresholdPct?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3_650)
  retentionDays?: number;

  @IsOptional()
  @IsBoolean()
  speedingAlertsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  idleAlertsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  geofenceAlertsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  harshDrivingAlertsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  offlineAlertsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  healthAlertsEnabled?: boolean;
}
