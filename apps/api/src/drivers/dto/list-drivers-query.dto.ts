import { DriverStatus } from "@prisma/client";
import { Transform, Type } from "class-transformer";
import { IsBoolean, IsEnum, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

export const DRIVER_SORT_FIELDS = ["employeeCode", "firstName", "lastName", "status", "createdAt"] as const;
export type DriverSortField = (typeof DRIVER_SORT_FIELDS)[number];

function parseBooleanParam({ value }: { value: unknown }): boolean {
  return value === "true" || value === true;
}

export class ListDriversQueryDto {
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
  @IsEnum(DriverStatus)
  status?: DriverStatus;

  @IsOptional()
  @Transform(parseBooleanParam)
  @IsBoolean()
  includeArchived: boolean = false;

  @IsOptional()
  @IsIn(DRIVER_SORT_FIELDS)
  sortBy: DriverSortField = "createdAt";

  @IsOptional()
  @IsIn(["asc", "desc"])
  sortOrder: "asc" | "desc" = "desc";
}
