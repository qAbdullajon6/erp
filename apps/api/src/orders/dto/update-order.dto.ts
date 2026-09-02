import {
  IsArray,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { Transform, Type } from "class-transformer";
import { ACTIVE_ISO_4217_CODES } from "../currency-codes.util";
import { CreateOrderStopDto } from "./create-order-stop.dto";

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
  @IsString()
  @MaxLength(20)
  pickupPostalCode?: string;

  @IsOptional()
  @IsString()
  @Length(2, 2)
  pickupCountryCode?: string;

  @IsOptional()
  @Transform(({ value }) => (value == null ? value : Number(value)))
  @IsNumber()
  pickupLat?: number;

  @IsOptional()
  @Transform(({ value }) => (value == null ? value : Number(value)))
  @IsNumber()
  pickupLng?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  pickupPlaceName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  pickupContactName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  pickupContactPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  pickupInstructions?: string;

  @IsOptional()
  @IsDateString()
  pickupWindowStart?: string;

  @IsOptional()
  @IsDateString()
  pickupWindowEnd?: string;

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
  @IsString()
  @MaxLength(20)
  deliveryPostalCode?: string;

  @IsOptional()
  @IsString()
  @Length(2, 2)
  deliveryCountryCode?: string;

  @IsOptional()
  @Transform(({ value }) => (value == null ? value : Number(value)))
  @IsNumber()
  deliveryLat?: number;

  @IsOptional()
  @Transform(({ value }) => (value == null ? value : Number(value)))
  @IsNumber()
  deliveryLng?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  deliveryPlaceName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  deliveryContactName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  deliveryContactPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  deliveryInstructions?: string;

  @IsOptional()
  @IsDateString()
  deliveryWindowStart?: string;

  @IsOptional()
  @IsDateString()
  deliveryWindowEnd?: string;

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
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  freightCharge?: number | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  fuelSurcharge?: number | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  otherCharges?: number | null;

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

  /// undefined = no change; empty array = delete all stops; populated = replace all stops
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderStopDto)
  orderStops?: CreateOrderStopDto[];
}
