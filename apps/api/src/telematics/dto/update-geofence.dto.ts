import { GeofenceType } from "@prisma/client";
import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsHexColor,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { GeofenceVertexDto } from "./create-geofence.dto";

/// A geofence patch. Every field optional; geometry consistency (a CIRCLE
/// keeping its centre/radius, a POLYGON keeping ≥3 vertices) is re-checked in
/// GeofenceService.update against the merged result, not just the patch.
///
/// Written out explicitly rather than via PartialType — this repo does not
/// depend on @nestjs/mapped-types, and the update DTOs (see UpdateVehicleDto)
/// are all hand-written for the same reason.
export class UpdateGeofenceDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsEnum(GeofenceType)
  type?: GeofenceType;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  centerLat?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  centerLng?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(500_000)
  radiusM?: number;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(3)
  @ValidateNested({ each: true })
  @Type(() => GeofenceVertexDto)
  polygon?: GeofenceVertexDto[];

  @IsOptional()
  @IsHexColor()
  color?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  category?: string;

  @IsOptional()
  @IsString()
  linkedCustomerId?: string;

  @IsOptional()
  @IsBoolean()
  alertOnEnter?: boolean;

  @IsOptional()
  @IsBoolean()
  alertOnExit?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(86_400)
  dwellThresholdSec?: number;
}
