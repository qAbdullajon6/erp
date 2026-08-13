import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { ACTIVE_ISO_4217_CODES } from "../currency-codes.util";

/// Deliberately excludes `status`, `driverId`, and `vehicleId` — those only
/// ever change through /orders/:id/assign, /orders/:id/status, and
/// /orders/:id/cancel, never a generic PATCH. See OrdersService.
export class UpdateOrderDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Matches(/^[A-Za-z0-9][A-Za-z0-9-]*$/, {
    message: "orderNumber may only contain letters, numbers and hyphens",
  })
  orderNumber?: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  pickupAddress?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  pickupCity?: string;

  @IsOptional()
  @IsDateString()
  pickupDate?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  deliveryAddress?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  deliveryCity?: string;

  @IsOptional()
  @IsDateString()
  deliveryDate?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  cargoDescription?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  cargoWeightKg?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  cargoVolumeM3?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price?: number;

  @IsOptional()
  @IsString()
  @IsIn([...ACTIVE_ISO_4217_CODES], { message: "currency must be a valid ISO 4217 code, e.g. USD" })
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  deliveryNotes?: string;
}
