import { IsOptional, IsUUID } from "class-validator";
import { CreateOrderDto } from "./create-order.dto";

/// Body for POST /orders/check-duplicate — same commercial fields as create.
export class CheckDuplicateOrderDto extends CreateOrderDto {
  @IsOptional()
  @IsUUID()
  excludeOrderId?: string;
}
