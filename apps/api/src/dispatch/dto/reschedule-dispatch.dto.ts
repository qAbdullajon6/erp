import { IsDateString, IsOptional } from "class-validator";

/// Calendar drag / resize — moves the scheduled trip window.
///
/// When `deliveryDateScheduled` is omitted the server keeps the previous trip
/// duration (pickup delta applied to delivery), so a pure time-drag does not
/// silently collapse the ETA.
export class RescheduleDispatchDto {
  @IsDateString()
  pickupDateScheduled!: string;

  @IsOptional()
  @IsDateString()
  deliveryDateScheduled?: string;
}
