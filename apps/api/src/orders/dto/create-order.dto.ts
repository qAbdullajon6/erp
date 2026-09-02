import {
  IsArray,
  IsBoolean,
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

export class CreateOrderDto {
  /// Omit to auto-generate the next sequential ORD-<year>-0001-style number
  /// for this organization; provide to set one explicitly — same
  /// auto-generate-with-override pattern as Customer.customerCode.
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Matches(/^[A-Za-z0-9][A-Za-z0-9-]*$/, {
    message: "orderNumber may only contain letters, numbers and hyphens",
  })
  orderNumber?: string;

  @IsUUID()
  customerId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(300)
  pickupAddress!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  pickupCity!: string;

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

  @IsDateString()
  pickupDate!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(300)
  deliveryAddress!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  deliveryCity!: string;

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

  @IsDateString()
  deliveryDate!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  cargoDescription!: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  cargoWeightKg?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  cargoVolumeM3?: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price!: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  freightCharge?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  fuelSurcharge?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  otherCharges?: number;

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

  /// Set when the client proceeded despite a duplicate warning.
  @IsOptional()
  @Transform(({ value }) => value === true || value === "true")
  @IsBoolean()
  acknowledgeDuplicate?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderStopDto)
  orderStops?: CreateOrderStopDto[];
}
