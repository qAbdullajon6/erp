import { OrderStatus } from "@prisma/client";
import { IsEnum, IsOptional } from "class-validator";

/// Deliberately minimal — no pagination, no organization/customer/driver
/// filters. `driverId` is never accepted from the client here; it's always
/// derived server-side from the caller's linked Driver profile (see
/// OrdersController.listMine).
export class ListMyOrdersQueryDto {
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;
}
