import { VehicleStatus } from "@prisma/client";
import { Transform, Type } from "class-transformer";
import { IsBoolean, IsEnum, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

export const VEHICLE_SORT_FIELDS = ["vehicleCode", "plateNumber", "type", "status", "createdAt"] as const;
export type VehicleSortField = (typeof VEHICLE_SORT_FIELDS)[number];

function parseBooleanParam({ value }: { value: unknown }): boolean {
  return value === "true" || value === true;
}

export class ListVehiclesQueryDto {
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
  @IsEnum(VehicleStatus)
  status?: VehicleStatus;

  @IsOptional()
  @Transform(parseBooleanParam)
  @IsBoolean()
  includeArchived: boolean = false;

  @IsOptional()
  @IsIn(VEHICLE_SORT_FIELDS)
  sortBy: VehicleSortField = "createdAt";

  @IsOptional()
  @IsIn(["asc", "desc"])
  sortOrder: "asc" | "desc" = "desc";
}
