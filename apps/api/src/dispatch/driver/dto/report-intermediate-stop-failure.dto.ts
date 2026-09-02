import { DeliveryFailureReason } from "@prisma/client";
import { IsEnum, IsOptional, IsString, MaxLength } from "class-validator";

// Reuses DeliveryFailureReason because:
// 1. DispatchStop.failureReason is String? — no migration needed to store enum values.
// 2. The reason set (WRONG_ADDRESS, ACCESS_PROBLEM, VEHICLE_PROBLEM, OTHER, etc.)
//    covers the most common intermediate-stop failure scenarios without inventing a
//    separate enum that would need a Prisma migration.
// 3. Consistency with the delivery failure DTO so drivers see the same reason picker.
export class ReportIntermediateStopFailureDto {
  @IsEnum(DeliveryFailureReason)
  reason!: DeliveryFailureReason;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
