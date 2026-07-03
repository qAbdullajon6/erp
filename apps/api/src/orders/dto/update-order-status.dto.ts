import { OrderStatus } from "@prisma/client";
import { IsEnum, IsOptional, IsString, MaxLength } from "class-validator";

/// `status: "CANCELLED"` passes this DTO's validation (it's a real enum
/// value) but is always rejected by OrdersService's transition allowlist,
/// which never lists CANCELLED as a reachable target from here —
/// cancellation only ever happens through the dedicated
/// /orders/:id/cancel action, which applies its own "not already
/// DELIVERED/CANCELLED" rule instead of the forward-only allowlist used here.
export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus)
  status!: OrderStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
