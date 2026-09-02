import { IsEnum, IsOptional, IsString, MaxLength } from "class-validator";
import type { DispatchStatus } from "@prisma/client";

export class UpdateDispatchStatusDto {
  @IsEnum(["DRAFT", "ASSIGNED", "EN_ROUTE_TO_PICKUP", "AT_PICKUP", "IN_TRANSIT", "AT_STOP", "ARRIVED_AT_DELIVERY", "DELIVERED", "CANCELLED"])
  status: DispatchStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
