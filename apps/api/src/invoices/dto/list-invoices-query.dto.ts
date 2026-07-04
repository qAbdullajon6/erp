import { InvoiceStatus } from "@prisma/client";
import { Type } from "class-transformer";
import { IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from "class-validator";

export const INVOICE_SORT_FIELDS = [
  "invoiceNumber",
  "issueDate",
  "dueDate",
  "totalAmount",
  "balanceDue",
  "status",
  "createdAt",
] as const;
export type InvoiceSortField = (typeof INVOICE_SORT_FIELDS)[number];

export class ListInvoicesQueryDto {
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
  @IsEnum(InvoiceStatus)
  status?: InvoiceStatus;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsUUID()
  orderId?: string;

  @IsOptional()
  @IsDateString()
  issueDateFrom?: string;

  @IsOptional()
  @IsDateString()
  issueDateTo?: string;

  @IsOptional()
  @IsIn(INVOICE_SORT_FIELDS)
  sortBy: InvoiceSortField = "createdAt";

  @IsOptional()
  @IsIn(["asc", "desc"])
  sortOrder: "asc" | "desc" = "desc";
}
