import { IsDateString, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

export class CreateRouteDto {
  @IsDateString()
  plannedDate: string;

  @IsOptional()
  @IsUUID()
  driverId?: string;

  @IsOptional()
  @IsUUID()
  vehicleId?: string;

  @IsOptional()
  @IsDateString()
  startTime?: string;

  @IsOptional()
  @IsDateString()
  endTime?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
