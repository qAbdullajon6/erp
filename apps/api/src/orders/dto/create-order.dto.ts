import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

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
  @IsString()
  @Matches(/^[A-Z]{3}$/, { message: "currency must be a 3-letter ISO 4217 code, e.g. USD" })
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
