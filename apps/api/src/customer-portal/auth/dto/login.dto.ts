import { IsEmail, IsOptional, IsString } from "class-validator";

export class CustomerPortalLoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  password!: string;

  /// Which organization the customer belongs to, by slug. Required only when
  /// the same email is registered as a portal account in more than one
  /// organization — CustomerPortalAuthService detects this ambiguity and asks
  /// for it explicitly rather than silently guessing (see the login flow's
  /// fixed org-resolution logic).
  @IsOptional()
  @IsString()
  organizationSlug?: string;
}
