import { CustomerPaymentTerms } from "@prisma/client";
import {
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export class CreateCustomerDto {
  /// Omit to auto-generate the next sequential CUS-0001-style code for this
  /// organization; provide to set one explicitly (validated for format and
  /// per-organization uniqueness).
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Matches(/^[A-Za-z0-9][A-Za-z0-9-]*$/, {
    message: "customerCode may only contain letters, numbers and hyphens",
  })
  customerCode?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  companyName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  contactName!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  taxId?: string;

  @IsOptional()
  @IsEnum(CustomerPaymentTerms)
  paymentTerms?: CustomerPaymentTerms;

  /// Plain number on input (up to 2 decimal places); serialized back as a
  /// decimal string in responses — see Customer model comment in
  /// schema.prisma and docs/CUSTOMERS_API.md.
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  creditLimit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  deliveryNotes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  internalNotes?: string;
}
