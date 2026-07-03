import { IsOptional, IsString, Length, MaxLength, MinLength } from "class-validator";

/// Slug and status are deliberately not editable through this endpoint —
/// slug changes need the same collision handling as creation, and status
/// changes (suspend/archive) are a bigger administrative action than a
/// routine settings update. Both are out of scope for this phase.
export class UpdateOrganizationDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(3, 3, { message: "defaultCurrency must be a 3-letter ISO 4217 code, e.g. USD" })
  defaultCurrency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  timezone?: string;
}
