import {
  IsEmail,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  MaxLength,
  MinLength,
  ValidateIf,
} from "class-validator";
import { IsActiveCurrencyCode, IsSupportedTimezone } from "./organization-validators";

/// Slug and status are deliberately not editable through this endpoint —
/// slug changes need the same collision handling as creation, and status
/// changes (suspend/archive) are a bigger administrative action than a
/// routine settings update. Both are out of scope for this phase.
///
/// Every company-identity field accepts `null` to clear it (class-validator's
/// `@IsOptional` skips null as well as undefined) while `undefined` means
/// "leave unchanged"; the service also folds `""` into null so a blanked-out
/// input in the UI clears the column instead of storing an empty string.
/// Format checks are skipped for the clearing values so clearing an email or
/// URL is never rejected as malformed.
export class UpdateOrganizationDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(3, 3, { message: "defaultCurrency must be a 3-letter ISO 4217 code, e.g. USD" })
  @IsActiveCurrencyCode()
  defaultCurrency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @IsSupportedTimezone()
  timezone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  legalName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  registrationNumber?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  taxId?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== "")
  @IsEmail({}, { message: "email must be a valid email address" })
  @MaxLength(255)
  email?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== "")
  @IsUrl(
    { protocols: ["http", "https"], require_protocol: true },
    { message: "website must be an http(s) URL" },
  )
  @MaxLength(300)
  website?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string | null;

  /// Rendered as an <img> on printed invoices, so it must be a fetchable
  /// absolute URL — a relative path or data: URI would silently render broken.
  @IsOptional()
  @ValidateIf((_, value) => value !== "")
  @IsUrl(
    { protocols: ["http", "https"], require_protocol: true },
    { message: "logoUrl must be an http(s) URL" },
  )
  @MaxLength(500)
  logoUrl?: string | null;
}
