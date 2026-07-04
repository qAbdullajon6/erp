import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { InvoiceLineItemInputDto } from "./invoice-line-item-input.dto";

/// Only ever accepted while the invoice is DRAFT (InvoicesService.update) —
/// "allow authorized editing before finalization" from the phase spec.
/// `lineItems`, if given, fully REPLACES the existing line items (simpler
/// and safer than a partial patch of an array); totals are always
/// recomputed server-side from whatever the resulting line items are.
export class UpdateInvoiceDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Matches(/^[A-Za-z0-9][A-Za-z0-9-]*$/, {
    message: "invoiceNumber may only contain letters, numbers and hyphens",
  })
  invoiceNumber?: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsUUID()
  orderId?: string;

  @IsOptional()
  @IsDateString()
  issueDate?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/, { message: "currency must be a 3-letter ISO 4217 code, e.g. USD" })
  currency?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: "An invoice needs at least one line item" })
  @ValidateNested({ each: true })
  @Type(() => InvoiceLineItemInputDto)
  lineItems?: InvoiceLineItemInputDto[];

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discountAmount?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  taxAmount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
