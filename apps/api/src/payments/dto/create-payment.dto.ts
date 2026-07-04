import { PaymentMethod } from "@prisma/client";
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, Matches, MaxLength, Min } from "class-validator";

export class CreatePaymentDto {
  @IsOptional()
  @IsDateString()
  paymentDate?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  /// Optional — if given, must match the invoice's own currency exactly.
  /// There is no cross-currency conversion in this phase (see
  /// docs/FINANCE_API.md), so a mismatched currency is rejected rather than
  /// silently misinterpreted.
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/, { message: "currency must be a 3-letter ISO 4217 code, e.g. USD" })
  currency?: string;

  @IsEnum(PaymentMethod)
  method!: PaymentMethod;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
