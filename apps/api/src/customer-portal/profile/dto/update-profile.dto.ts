import { Type } from "class-transformer";
import {
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from "class-validator";

class ProfileNotificationPreferencesDto {
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

export class UpdateCustomerProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  contactName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  language?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ProfileNotificationPreferencesDto)
  notificationPreferences?: ProfileNotificationPreferencesDto;
}
