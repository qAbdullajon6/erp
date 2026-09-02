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

/// Excludes ARCHIVED from `status` on purpose — archiving/restoring always
/// goes through the dedicated POST /:id/archive and /:id/restore endpoints,
/// which also keep `archivedAt` in sync. This is the one place PATCH is
/// deliberately more restrictive than the full CustomerStatus enum.
export type EditableCustomerStatus = "ACTIVE" | "AT_RISK" | "INACTIVE";
const EDITABLE_STATUSES: EditableCustomerStatus[] = ["ACTIVE", "AT_RISK", "INACTIVE"];

export class UpdateCustomerDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Matches(/^[A-Za-z0-9][A-Za-z0-9-]*$/, {
    message: "customerCode may only contain letters, numbers and hyphens",
  })
  customerCode?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  companyName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  contactName?: string;

  @IsOptional()
  @IsEmail()
  email?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  @Matches(/^[A-Z]{2}$/, { message: "country must be a 2-letter ISO 3166-1 alpha-2 code (e.g. UZ)" })
  country?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string | null;

  /// Latitude from a Mapbox suggestion; null clears stored coordinates.
  @IsOptional()
  @ValidateIf((o: UpdateCustomerDto) => o.cityLat != null)
  @IsNumber({ maxDecimalPlaces: 15 })
  cityLat?: number | null;

  /// Longitude from a Mapbox suggestion; null clears stored coordinates.
  @IsOptional()
  @ValidateIf((o: UpdateCustomerDto) => o.cityLng != null)
  @IsNumber({ maxDecimalPlaces: 15 })
  cityLng?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  taxId?: string | null;

  @IsOptional()
  @IsEnum(CustomerPaymentTerms)
  paymentTerms?: CustomerPaymentTerms;

  @ValidateIf(
    (o: UpdateCustomerDto) =>
      o.paymentTerms === "CUSTOM" || o.paymentTermsDays !== undefined,
  )
  @IsInt()
  @Min(0)
  paymentTermsDays?: number;

  @IsOptional()
  @ValidateIf((o: UpdateCustomerDto) => o.creditLimit != null)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  creditLimit?: number | null;

  /// null = clear override (use org default); omit = leave unchanged.
  @IsOptional()
  @ValidateIf((o: UpdateCustomerDto) => o.currency != null)
  @IsIn([...ISO4217_CODES], { message: "currency must be a valid ISO 4217 code (e.g. USD, EUR, UZS)" })
  currency?: string | null;

  @IsOptional()
  @IsIn(EDITABLE_STATUSES)
  status?: EditableCustomerStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  deliveryNotes?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  internalNotes?: string | null;
}
