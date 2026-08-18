import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from "class-validator";
import { FeatureFlagScope } from "@prisma/client";

export class CreateFeatureFlagDto {
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  key!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsBoolean()
  enabledGlobal?: boolean;

  @IsOptional()
  @IsEnum(FeatureFlagScope)
  scope?: FeatureFlagScope;
}

export class UpdateFeatureFlagDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsBoolean()
  enabledGlobal?: boolean;

  @IsOptional()
  @IsEnum(FeatureFlagScope)
  scope?: FeatureFlagScope;
}

export class UpsertFeatureFlagOverrideDto {
  @IsOptional()
  @IsUUID()
  planId?: string;

  @IsOptional()
  @IsUUID()
  organizationId?: string;

  @IsBoolean()
  enabled!: boolean;
}
