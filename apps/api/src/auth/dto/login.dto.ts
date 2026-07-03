import { IsEmail, IsOptional, IsString } from "class-validator";

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  password!: string;

  /// Optional: which organization to sign into, when the user belongs to
  /// more than one. Always validated server-side against the user's actual
  /// Memberships — never trusted blindly. Omit to default to the user's
  /// first active membership.
  @IsOptional()
  @IsString()
  organizationSlug?: string;
}
