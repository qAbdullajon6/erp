import { NotificationCategory } from "@prisma/client";
import { IsArray, IsBoolean, IsEnum, IsInt, IsOptional, Max, Min } from "class-validator";

export class UpdateNotificationSettingsDto {
  @IsOptional()
  @IsArray()
  @IsEnum(NotificationCategory, { each: true })
  enabledCategories?: NotificationCategory[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(90)
  invoiceDueSoonDays?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  creditLimitWarningPercent?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  expiryWarningDays?: number;

  @IsOptional()
  @IsBoolean()
  lowSeverityEnabled?: boolean;
}
