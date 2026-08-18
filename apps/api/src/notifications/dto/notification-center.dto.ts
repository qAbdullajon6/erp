import { NotificationCategory, NotificationSeverity } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import {
  NOTIFICATION_SORT_FIELDS,
  type NotificationSortField,
} from './list-notifications-query.dto';

/// Same query-string parsing as ListNotificationsQueryDto — Nest receives
/// page/limit/booleans as strings from the URL, so @Type/@Transform are
/// required or ValidationPipe rejects the request with 400.
function parseBooleanParam({ value }: { value: unknown }): boolean {
  return value === 'true' || value === true;
}

export class NotificationQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

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

  @IsOptional()
  @Transform(parseBooleanParam)
  @IsBoolean()
  isArchived?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsIn(NOTIFICATION_SORT_FIELDS)
  sortBy?: NotificationSortField = 'createdAt';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}

export class BulkNotificationActionDto {
  @IsString({ each: true })
  notificationIds: string[];
}

export class UpdatePreferencesDto {
  @IsOptional()
  @IsBoolean()
  emailEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  smsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  pushEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  webhookEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  digestMode?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  digestTime?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  quietHoursStart?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  quietHoursEnd?: number;

  @IsOptional()
  @IsString()
  timezone?: string;
}
