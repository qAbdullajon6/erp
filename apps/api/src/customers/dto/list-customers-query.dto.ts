import { CustomerStatus } from "@prisma/client";
import { Transform, Type } from "class-transformer";
import { emptyToUndefined } from "../../common/query-transform.util";
import { IsBoolean, IsEnum, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

export const CUSTOMER_SORT_FIELDS = [
  "customerCode",
  "companyName",
  "createdAt",
  "updatedAt",
  "creditLimit",
  "status",
] as const;
export type CustomerSortField = (typeof CUSTOMER_SORT_FIELDS)[number];

function parseBooleanParam({ value }: { value: unknown }): boolean {
  return value === "true" || value === true;
}

/// `hasOverdueBalance` is deliberately NOT a filter here even though Customer
/// now has real Order/Invoice relations: computing it means aggregating every
/// customer's invoices, which this endpoint's single findMany/count is not
/// shaped to do cheaply. The frontend derives an equivalent "Outstanding"
/// view client-side today (customer-relationship-stats.ts) instead.
export class ListCustomersQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  /// Capped at 200 rather than 100: the Orders and Invoices screens load the
  /// full customer set in one request to populate their customer pickers.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit: number = 20;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsEnum(CustomerStatus)
  status?: CustomerStatus;

  @IsOptional()
  @Transform(parseBooleanParam)
  @IsBoolean()
  includeArchived: boolean = false;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsIn(CUSTOMER_SORT_FIELDS)
  sortBy: CustomerSortField = "createdAt";

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsIn(["asc", "desc"])
  sortOrder: "asc" | "desc" = "desc";
}
