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

export class CreateInvoiceDto {
  /// Omit to auto-generate the next sequential INV-<year>-0001-style
  /// number for this organization — same pattern as Order.orderNumber.
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Matches(/^[A-Za-z0-9][A-Za-z0-9-]*$/, {
    message: "invoiceNumber may only contain letters, numbers and hyphens",
  })
  invoiceNumber?: string;

  @IsUUID()
  customerId!: string;

  /// If given, the order must exist, be DELIVERED, and have no other
  /// non-cancelled invoice — the same eligibility InvoicesService.createFromOrder
  /// enforces, applied here too so the invariant holds regardless of which
  /// endpoint created the invoice.
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

  @IsArray()
  @ArrayMinSize(1, { message: "An invoice needs at least one line item" })
  @ValidateNested({ each: true })
  @Type(() => InvoiceLineItemInputDto)
  lineItems!: InvoiceLineItemInputDto[];

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
