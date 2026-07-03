import { CustomerPaymentTerms } from "@prisma/client";
import {
  IsEmail,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

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
  @MaxLength(100)
  country?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  taxId?: string | null;

  @IsOptional()
  @IsEnum(CustomerPaymentTerms)
  paymentTerms?: CustomerPaymentTerms;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  creditLimit?: number;

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
