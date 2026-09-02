import { Type } from "class-transformer";
import {
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export const CONVERT_PLAN_CHOICES = ["trial", "starter", "professional", "enterprise"] as const;
export type ConvertPlanChoice = (typeof CONVERT_PLAN_CHOICES)[number];

/// Body for POST /platform/leads/:id/convert — Convert Wizard finish payload.
export class ConvertLeadDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  organizationName!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  /// Lowercase slug; uniqueness enforced in service.
  slug!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(64)
  timezone!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(3)
  currency!: string;

  @IsIn(CONVERT_PLAN_CHOICES)
  plan!: ConvertPlanChoice;

  /// Required when plan === "trial"; ignored otherwise (defaults applied).
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  trialDays?: number;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  adminFirstName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  adminLastName!: string;

  @IsEmail()
  @MaxLength(255)
  adminEmail!: string;
}
