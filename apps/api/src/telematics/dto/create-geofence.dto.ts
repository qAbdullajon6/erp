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

export class GeofenceVertexDto {
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat!: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  lng!: number;
}

export class CreateGeofenceDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsEnum(GeofenceType)
  type!: GeofenceType;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  // --- CIRCLE geometry ---
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

  // --- POLYGON geometry ---
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
