import { IsOptional, IsString, IsUUID } from "class-validator";

export class UpdateDispatchDto {
  @IsOptional()
  @IsString()
  notes?: string;

  /// Reassignment (Task 8.7). Both are optional and additive: a request that sends
  /// only `notes` behaves exactly as it always has.
  ///
  /// Supplying either one re-runs AssignmentPolicy and, when the resource actually
  /// changes, closes the dispatch's open DispatchAssignment and opens a new one
  /// (R9). This is the ONLY way a driver or vehicle may be changed —
  /// POST /orders/:id/assign is a wrapper that ends up here.
  @IsOptional()
  @IsUUID()
  driverId?: string;

  @IsOptional()
  @IsUUID()
  vehicleId?: string;
}
