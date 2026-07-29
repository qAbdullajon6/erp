import { IsBoolean, IsDateString, IsOptional, IsUUID } from "class-validator";

export class CheckDispatchConflictsDto {
  @IsOptional()
  @IsUUID()
  driverId?: string;

  @IsOptional()
  @IsUUID()
  vehicleId?: string;

  @IsOptional()
  @IsDateString()
  pickupDateScheduled?: string;

  @IsOptional()
  @IsDateString()
  deliveryDateScheduled?: string;

  /// When true, writes `dispatch.conflict_rechecked` audit. Live validation
  /// calls omit this so assignment previews do not spam the audit log.
  @IsOptional()
  @IsBoolean()
  recordAudit?: boolean;
}
