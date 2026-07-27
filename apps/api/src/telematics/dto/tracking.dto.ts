import { Type } from "class-transformer";
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateIf,
} from "class-validator";
import { TrackingSessionSource } from "@prisma/client";

export class OpenTrackingSessionDto {
  @IsOptional()
  @IsUUID()
  vehicleId?: string;

  @IsOptional()
  @IsUUID()
  driverId?: string;

  @IsOptional()
  @IsUUID()
  deviceId?: string;

  @IsOptional()
  @IsUUID()
  dispatchId?: string;

  @IsEnum(TrackingSessionSource)
  source!: TrackingSessionSource;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class TrackingHeartbeatDto {
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

/// Bounded history query. Always range-limited so gps_positions is never
/// scanned unbounded from the API.
export class TrackingHistoryQueryDto {
  @ValidateIf((o: TrackingHistoryQueryDto) => !o.driverId)
  @IsUUID()
  vehicleId?: string;

  @ValidateIf((o: TrackingHistoryQueryDto) => !o.vehicleId)
  @IsUUID()
  driverId?: string;

  @IsISO8601()
  from!: string;

  @IsISO8601()
  to!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  limit?: number;
}

export class TrackingHeartbeatQueryDto {
  @IsOptional()
  @IsUUID()
  sessionId?: string;

  @IsOptional()
  @IsUUID()
  vehicleId?: string;

  @IsOptional()
  @IsUUID()
  driverId?: string;

  @IsOptional()
  @IsUUID()
  dispatchId?: string;
}
