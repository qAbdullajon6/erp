import { IsDateString, IsOptional, IsString, IsUUID } from "class-validator";

export class CreateDispatchDto {
  @IsUUID()
  orderId: string;

  @IsUUID()
  driverId: string;

  @IsUUID()
  vehicleId: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
