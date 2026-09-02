import { CustomerPaymentTerms } from "@prisma/client";
import {
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from "class-validator";
import { ISO4217_CODES } from "../../common/iso4217-currencies";

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

  /// Contact name is optional at creation — it can be set later once the
  /// relevant person is known. If provided it must be non-empty.
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  contactName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  @Matches(/^[A-Z]{2}$/, { message: "country must be a 2-letter ISO 3166-1 alpha-2 code (e.g. UZ)" })
  country?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  /// Latitude from a Mapbox city suggestion — stored directly without a
  /// second geocoding call. Omit when city was entered as free text.
  @IsOptional()
  @ValidateIf((o: CreateCustomerDto) => o.cityLat != null)
  @IsNumber({ maxDecimalPlaces: 15 })
  cityLat?: number;

  /// Longitude from a Mapbox city suggestion.
  @IsOptional()
  @ValidateIf((o: CreateCustomerDto) => o.cityLng != null)
  @IsNumber({ maxDecimalPlaces: 15 })
  cityLng?: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  taxId?: string;

  @IsOptional()
  @IsEnum(CustomerPaymentTerms)
  paymentTerms?: CustomerPaymentTerms;

  /// Days until invoice due — required when paymentTerms = CUSTOM, optional otherwise.
  /// If provided for non-CUSTOM terms it is validated but ignored in calculations.
  /// Must be a non-negative integer.
  @ValidateIf(
    (o: CreateCustomerDto) =>
      o.paymentTerms === "CUSTOM" || o.paymentTermsDays !== undefined,
  )
  @IsInt()
  @Min(0)
  paymentTermsDays?: number;

  /// Plain number on input (up to 2 decimal places); serialized back as a
  /// decimal string in responses — see Customer model comment in
  /// schema.prisma and docs/CUSTOMERS_API.md.
  /// null / undefined = no configured credit ceiling ("No credit limit").
  /// 0 = explicitly $0 (no credit allowed). >0 = credit cap.
  @IsOptional()
  @ValidateIf((o: CreateCustomerDto) => o.creditLimit != null)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  creditLimit?: number | null;

  /// ISO 4217 currency code (e.g. "USD", "UZS"). When omitted the
  /// organization defaultCurrency applies.
  @IsOptional()
  @IsIn([...ISO4217_CODES], { message: "currency must be a valid ISO 4217 code (e.g. USD, EUR, UZS)" })
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  deliveryNotes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  internalNotes?: string;
}
