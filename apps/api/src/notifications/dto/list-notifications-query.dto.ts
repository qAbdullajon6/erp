import { NotificationCategory, NotificationSeverity } from "@prisma/client";
import { Transform, Type } from "class-transformer";
import { IsBoolean, IsEnum, IsIn, IsInt, IsOptional, Max, Min } from "class-validator";

export const NOTIFICATION_SORT_FIELDS = ["createdAt", "severity"] as const;
export type NotificationSortField = (typeof NOTIFICATION_SORT_FIELDS)[number];

function parseBooleanParam({ value }: { value: unknown }): boolean {
  return value === "true" || value === true;
}

export class ListNotificationsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @IsOptional()
  @IsEnum(NotificationCategory)
  category?: NotificationCategory;

  @IsOptional()
  @IsEnum(NotificationSeverity)
  severity?: NotificationSeverity;

  @IsOptional()
  @Transform(parseBooleanParam)
  @IsBoolean()
  isRead?: boolean;

  /// Default false — archived notifications are excluded unless explicitly
  /// requested, same "hidden by default" pattern as Customer's
  /// includeArchived.
  @IsOptional()
  @Transform(parseBooleanParam)
  @IsBoolean()
  isArchived: boolean = false;

  @IsOptional()
  @IsIn(NOTIFICATION_SORT_FIELDS)
  sortBy: NotificationSortField = "createdAt";

  @IsOptional()
  @IsIn(["asc", "desc"])
  sortOrder: "asc" | "desc" = "desc";
}
