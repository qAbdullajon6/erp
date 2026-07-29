import { Type } from "class-transformer";
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from "class-validator";
import { DriverOperationalStatus, ExpenseCategory } from "@prisma/client";

export class UpdateOperationalStatusDto {
  @IsEnum(DriverOperationalStatus)
  status!: DriverOperationalStatus;
}

export class CreateDriverExpenseDto {
  @IsEnum(ExpenseCategory)
  category!: ExpenseCategory;

  @IsString()
  @MaxLength(200)
  description!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @IsUUID()
  orderId?: string;

  @IsOptional()
  @IsUUID()
  vehicleId?: string;

  @IsOptional()
  @IsUUID()
  dispatchId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  odometerKm?: number;
}

export class CreateDriverFuelDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  liters!: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  station?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  @IsOptional()
  @IsUUID()
  vehicleId?: string;

  @IsOptional()
  @IsUUID()
  dispatchId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  odometerKm?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class CreateVehicleInspectionDto {
  @IsUUID()
  vehicleId!: string;

  @IsOptional()
  @IsUUID()
  dispatchId?: string;

  @IsBoolean()
  tyres!: boolean;

  @IsBoolean()
  lights!: boolean;

  @IsBoolean()
  brakes!: boolean;

  @IsBoolean()
  oil!: boolean;

  @IsBoolean()
  coolant!: boolean;

  @IsBoolean()
  documents!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  odometerKm?: number;
}

export class UpdatePodMetaDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  receiverName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  receiverPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  odometerKm?: number;
}

export class ArrivalLocationDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lng?: number;
}
