import { IsDateString, IsOptional } from "class-validator";

/// If both dates are given, results exclude drivers/vehicles already tied to
/// an overlapping active order in that range (the same overlap rule as
/// OrdersService's double-booking check). If either is omitted, this
/// returns the plain administrative-status snapshot (ACTIVE drivers /
/// AVAILABLE vehicles) with no date filtering — see docs/ORDERS_DISPATCH_API.md.
export class DispatchAvailabilityQueryDto {
  @IsOptional()
  @IsDateString()
  pickupDate?: string;

  @IsOptional()
  @IsDateString()
  deliveryDate?: string;
}
