import { IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Min } from "class-validator";
import type { DispatchStatus } from "@prisma/client";

export class ListDispatchesQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number = 10;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(["DRAFT", "ASSIGNED", "EN_ROUTE_TO_PICKUP", "AT_PICKUP", "IN_TRANSIT", "DELIVERED", "CANCELLED"])
  status?: DispatchStatus;

  @IsOptional()
  @IsUUID()
  orderId?: string;

  @IsOptional()
  @IsUUID()
  driverId?: string;

  @IsOptional()
  @IsUUID()
  vehicleId?: string;

  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;

  @IsOptional()
  @IsString()
  sortBy?: "createdAt" | "pickupDateScheduled" | "deliveryDateScheduled" | "status" = "createdAt";

  @IsOptional()
  @IsEnum(["asc", "desc"])
  sortOrder?: "asc" | "desc" = "desc";
}
