import {
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

/// The scopes a key may hold. Closed set, validated on write: an unknown
/// scope on a stored key would silently grant nothing while looking like it
/// grants something, so it is rejected at the boundary instead.
///
/// Kept in lockstep with AVAILABLE_SCOPES in
/// apps/web/src/components/developer/api-keys-tab.tsx.
export const API_KEY_SCOPES = [
  "orders:read",
  "orders:write",
  "customers:read",
  "customers:write",
  "drivers:read",
  "vehicles:read",
  "finance:read",
  "webhooks:admin",
] as const;

export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

export class CreateApiKeyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsArray()
  @ArrayUnique()
  @IsIn(API_KEY_SCOPES, { each: true })
  scopes!: string[];

  /// Omit for a key that never expires.
  @IsOptional()
  @IsISO8601()
  expiresAt?: string;

  /// Requests per rolling 60-second window. Omit for the schema default (120).
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10_000)
  rateLimitPerMinute?: number;
}

export class UpdateApiKeyDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(API_KEY_SCOPES, { each: true })
  scopes?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10_000)
  rateLimitPerMinute?: number;
}
