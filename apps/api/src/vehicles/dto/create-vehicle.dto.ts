import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

const CURRENT_YEAR = new Date().getUTCFullYear();

export class CreateVehicleDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Matches(/^[A-Za-z0-9][A-Za-z0-9-]*$/, {
    message: "vehicleCode may only contain letters, numbers and hyphens",
  })
  vehicleCode?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  plateNumber!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  type!: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  capacityKg?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  capacityM3?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  make?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  model?: string;

  @IsOptional()
  @IsInt()
  @Min(1980)
  @Max(CURRENT_YEAR + 1)
  year?: number;

  @IsOptional()
  @IsDateString()
  insuranceExpiry?: string;

  @IsOptional()
  @IsDateString()
  inspectionExpiry?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  vin?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  engineNumber?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  odometer?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  fuelType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  transmission?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  axles?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
