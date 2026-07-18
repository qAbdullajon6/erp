import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsISO8601,
  IsNumber,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from "class-validator";

/// One position in the first-party (driver app / dispatcher) ingest shape.
/// This is the normalised contract; the GENERIC_WEBHOOK provider accepts the
/// same fields. Ranges are validated at the boundary so a bad client can't
/// poison the derived state with an impossible coordinate.
export class IngestPositionDto {
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;

  /// Device time. Defaults to server time when omitted.
  @IsOptional()
  @IsISO8601()
  recordedAt?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(400)
  speedKph?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(360)
  heading?: number;

  @IsOptional()
  @IsNumber()
  altitudeM?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  accuracyM?: number;

  @IsOptional()
  @IsBoolean()
  ignitionOn?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  odometerKm?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  fuelLevelPct?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  satellites?: number;
}

export class IngestPositionsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => IngestPositionDto)
  positions!: IngestPositionDto[];
}
