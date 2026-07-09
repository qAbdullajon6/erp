import { CustomerStatus } from "@prisma/client";
import { Transform, Type } from "class-transformer";
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

/// `hasOverdueBalance` is deliberately NOT a filter here: Customers has no
/// relation yet to Invoices/Orders (those are still ERP modules that only
/// exist in the frontend's localStorage demo), so there is nothing to
/// compute an overdue balance from on this API. See docs/CUSTOMERS_API.md.
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
  @IsEnum(CustomerStatus)
  status?: CustomerStatus;

  @IsOptional()
  @Transform(parseBooleanParam)
  @IsBoolean()
  includeArchived: boolean = false;

  @IsOptional()
  @IsIn(CUSTOMER_SORT_FIELDS)
  sortBy: CustomerSortField = "createdAt";

  @IsOptional()
  @IsIn(["asc", "desc"])
  sortOrder: "asc" | "desc" = "desc";
}
