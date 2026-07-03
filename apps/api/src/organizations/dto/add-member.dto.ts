import { IsEmail, IsEnum } from "class-validator";
import { MembershipRole } from "@prisma/client";

/// Adds an EXISTING user (found by email) to the current organization.
/// There is no email-invitation flow in this phase — if no user with this
/// email exists yet, the request fails with a clear 404 rather than
/// creating a half-usable, passwordless account.
export class AddMemberDto {
  @IsEmail()
  email!: string;

  @IsEnum(MembershipRole)
  role!: MembershipRole;
}
