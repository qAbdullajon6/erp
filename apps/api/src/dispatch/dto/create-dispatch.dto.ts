import { IsDateString, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

export class CreateDispatchDto {
  @IsUUID()
  orderId: string;

  @IsUUID()
  driverId: string;

  @IsUUID()
  vehicleId: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
