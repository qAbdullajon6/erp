import {
  IsDateString,
  IsDecimal,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from "class-validator";

export class AddRouteStopDto {
  @IsOptional()
  @IsUUID()
  orderId?: string;

  @IsOptional()
  @IsUUID()
  dispatchId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  label?: string;

  @IsString()
  @MaxLength(500)
  address: string;

  @IsString()
  @MaxLength(200)
  city: string;

  @IsOptional()
  @IsDecimal()
  lat?: string;

  @IsOptional()
  @IsDecimal()
  lng?: string;

  @IsOptional()
  @IsDateString()
  plannedArrival?: string;

  @IsOptional()
  @IsDateString()
  plannedDeparture?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
