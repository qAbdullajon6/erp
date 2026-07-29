import { OrderStatus } from "@prisma/client";
import { Transform, Type } from "class-transformer";
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from "class-validator";

export const ORDER_SORT_FIELDS = [
  "orderNumber",
  "pickupDate",
  "deliveryDate",
  "price",
  "status",
  "createdAt",
] as const;
export type OrderSortField = (typeof ORDER_SORT_FIELDS)[number];

export const ORDER_PAYMENT_STATUSES = ["UNPAID", "PARTIAL", "PAID", "NO_INVOICE"] as const;
export type OrderPaymentStatus = (typeof ORDER_PAYMENT_STATUSES)[number];

function toStatusArray(value: unknown): OrderStatus[] | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (Array.isArray(value)) return value as OrderStatus[];
  if (typeof value === "string") {
    return value.split(",").map((s) => s.trim()).filter(Boolean) as OrderStatus[];
  }
  return undefined;
}

function toBool(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (value === true || value === "true" || value === "1") return true;
  if (value === false || value === "false" || value === "0") return false;
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

  @IsOptional()
  @Transform(({ value }) => toStatusArray(value))
  @IsEnum(OrderStatus, { each: true })
  statuses?: OrderStatus[];

  @IsOptional()
  @Transform(({ value }) => (value === "" || value == null ? undefined : value))
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @Transform(({ value }) => (value === "" || value == null ? undefined : value))
  @IsUUID()
  driverId?: string;

  @IsOptional()
  @Transform(({ value }) => (value === "" || value == null ? undefined : value))
  @IsUUID()
  vehicleId?: string;

  @IsOptional()
  @Transform(({ value }) => (value === "" || value == null ? undefined : value))
  @IsUUID()
  dispatcherId?: string;

  @IsOptional()
  @IsString()
  pickupDateFrom?: string;

  @IsOptional()
  @IsString()
  pickupDateTo?: string;

  @IsOptional()
  @IsString()
  deliveryDateFrom?: string;

  @IsOptional()
  @IsString()
  deliveryDateTo?: string;

  @IsOptional()
  @IsString()
  createdFrom?: string;

  @IsOptional()
  @IsString()
  createdTo?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  priceMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  priceMax?: number;

  @IsOptional()
  @IsIn(ORDER_PAYMENT_STATUSES)
  paymentStatus?: OrderPaymentStatus;

  @IsOptional()
  @Transform(({ value }) => toBool(value))
  @IsBoolean()
  archivedOnly?: boolean;

  @IsOptional()
  @Transform(({ value }) => toBool(value))
  @IsBoolean()
  includeArchived?: boolean;

  @IsOptional()
  @IsIn(ORDER_SORT_FIELDS)
  sortBy: OrderSortField = "createdAt";

  @IsOptional()
  @IsIn(["asc", "desc"])
  sortOrder: "asc" | "desc" = "desc";
}
