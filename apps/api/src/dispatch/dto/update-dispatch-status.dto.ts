import { IsEnum, IsOptional, IsString } from "class-validator";
import type { DispatchStatus } from "@prisma/client";

export class UpdateDispatchStatusDto {
  @IsEnum(["DRAFT", "ASSIGNED", "EN_ROUTE_TO_PICKUP", "AT_PICKUP", "IN_TRANSIT", "DELIVERED", "CANCELLED"])
  status: DispatchStatus;

  @IsOptional()
  @IsString()
  note?: string;
}
