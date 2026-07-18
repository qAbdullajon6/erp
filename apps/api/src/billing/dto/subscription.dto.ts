import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsPositive, IsString, Min } from "class-validator";
import { Type } from "class-transformer";

export class CreateSubscriptionDto {
  @IsString()
  @IsNotEmpty()
  planId: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  trialDays?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  seats?: number;

  @IsOptional()
  @IsString()
  paymentCustomerId?: string;
}

export class UpgradeSubscriptionDto {
  @IsString()
  @IsNotEmpty()
  newPlanId: string;
}

export class DowngradeSubscriptionDto {
  @IsString()
  @IsNotEmpty()
  newPlanId: string;

  @IsOptional()
  @IsBoolean()
  immediate?: boolean;
}

export class CancelSubscriptionDto {
  @IsOptional()
  @IsBoolean()
  immediate?: boolean;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class AddSeatsDto {
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  count: number;
}

export class GetUsageQueryDto {
  @IsOptional()
  @IsString()
  metricType?: string;

  @IsOptional()
  @IsString()
  period?: "daily" | "monthly";
}
