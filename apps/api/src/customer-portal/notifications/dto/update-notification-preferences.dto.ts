import { Type } from "class-transformer";
import {
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from "class-validator";

class NotificationPreferencesDto {
  @IsOptional()
  @IsBoolean()
  shipmentAssigned?: boolean;

  @IsOptional()
  @IsBoolean()
  shipmentDelayed?: boolean;

  @IsOptional()
  @IsBoolean()
  shipmentDelivered?: boolean;

  @IsOptional()
  @IsBoolean()
  invoiceCreated?: boolean;

  @IsOptional()
  @IsBoolean()
  invoiceOverdue?: boolean;

  @IsOptional()
  @IsBoolean()
  paymentReceived?: boolean;

  @IsOptional()
  @IsBoolean()
  documentsAvailable?: boolean;
}

export class UpdateNotificationPreferencesDto {
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => NotificationPreferencesDto)
  preferences?: NotificationPreferencesDto;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  language?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;
}
