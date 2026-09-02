import { Transform, Type } from "class-transformer";
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from "class-validator";
import { DispatchStatus } from "@prisma/client";

function toStatusArray(value: unknown): DispatchStatus[] | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (Array.isArray(value)) return value as DispatchStatus[];
  if (typeof value === "string") {
    return value.split(",").map((s) => s.trim()).filter(Boolean) as DispatchStatus[];
  }
  return undefined;
}

export class ListDispatchesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 10;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsEnum(DispatchStatus)
  status?: DispatchStatus;

  /// Comma-separated or repeated — Active / Completed tabs need an IN filter
  /// without N parallel single-status fetches.
  @IsOptional()
  @Transform(({ value }) => toStatusArray(value))
  @IsEnum(DispatchStatus, { each: true })
  statuses?: DispatchStatus[];

  @IsOptional()
  @IsUUID()
  orderId?: string;

  @IsOptional()
  @IsUUID()
  driverId?: string;

  @IsOptional()
  @IsUUID()
  vehicleId?: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;

  @IsOptional()
  @IsString()
  sortBy?: "createdAt" | "pickupDateScheduled" | "deliveryDateScheduled" | "status" = "createdAt";

  @IsOptional()
  @IsEnum(["asc", "desc"])
  sortOrder?: "asc" | "desc" = "desc";
}
