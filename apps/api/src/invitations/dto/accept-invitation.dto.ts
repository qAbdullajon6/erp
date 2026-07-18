import { IsString, MaxLength, MinLength } from "class-validator";

/// Body for POST /invite/accept. `token` is the raw invitation token from the
/// emailed link; its format/state is validated by InvitationService (which
/// hashes and looks it up), so this DTO only requires a non-empty string and
/// does not re-check the token shape. Password rules mirror RegisterDto exactly
/// — no new password policy is introduced here.
export class AcceptInvitationDto {
  @IsString()
  @MinLength(1)
  token!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName!: string;

  @IsString()
  @MinLength(8, { message: "Password must be at least 8 characters long" })
  @MaxLength(72)
  password!: string;
}
