import { IsEnum, IsOptional, IsString, MaxLength } from "class-validator";
import { DriverRejectReason } from "@prisma/client";

export class RejectDispatchDto {
  @IsEnum(DriverRejectReason)
  reason!: DriverRejectReason;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
