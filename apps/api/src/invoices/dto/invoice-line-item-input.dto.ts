import { IsNumber, IsString, Min, MinLength } from "class-validator";

/// `lineTotal` is deliberately absent — InvoicesService always computes it
/// server-side as `quantity * unitPrice`, never trusting a client-supplied
/// value (see docs/FINANCE_API.md).
export class InvoiceLineItemInputDto {
  @IsString()
  @MinLength(1)
  description!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  quantity!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice!: number;
}
