import { IsUUID } from "class-validator";

/// Both are required — a "simple assign" always sets driver and vehicle
/// together, matching the frontend demo's original Dispatch Board UX. See
/// OrdersService.assign for validation (driver ACTIVE, vehicle AVAILABLE,
/// capacity, double-booking).
export class AssignOrderDto {
  @IsUUID()
  driverId!: string;

  @IsUUID()
  vehicleId!: string;
}
