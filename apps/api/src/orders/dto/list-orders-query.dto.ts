import { OrderStatus } from "@prisma/client";
import { Transform, Type } from "class-transformer";
import { IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from "class-validator";

export const ORDER_SORT_FIELDS = [
  "orderNumber",
  "pickupDate",
  "deliveryDate",
  "price",
  "status",
  "createdAt",
] as const;
export type OrderSortField = (typeof ORDER_SORT_FIELDS)[number];

function toStatusArray(value: unknown): OrderStatus[] | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (Array.isArray(value)) return value as OrderStatus[];
  if (typeof value === "string") {
    return value.split(",").map((s) => s.trim()).filter(Boolean) as OrderStatus[];
  }
  return undefined;
}

export class ListOrdersQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  /// Comma-separated or repeated query values — lets the Orders list "Needs
  /// Action" / "Active" tabs page correctly without N parallel single-status
  /// fetches capped at 100 rows each.
  @IsOptional()
  @Transform(({ value }) => toStatusArray(value))
  @IsEnum(OrderStatus, { each: true })
  statuses?: OrderStatus[];

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsUUID()
  driverId?: string;

  @IsOptional()
  @IsUUID()
  vehicleId?: string;

  @IsOptional()
  @IsIn(ORDER_SORT_FIELDS)
  sortBy: OrderSortField = "createdAt";

  @IsOptional()
  @IsIn(["asc", "desc"])
  sortOrder: "asc" | "desc" = "desc";
}
