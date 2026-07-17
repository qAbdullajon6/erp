import { IsString, MaxLength, MinLength } from "class-validator";

/// Body for POST /customer-portal/invitations/accept. `token` is the raw
/// invitation token from the emailed link; its format/state is validated by
/// CustomerPortalProvisioningService, so this DTO only requires a non-empty
/// string. Password rules mirror AcceptInvitationDto exactly — no new policy.
export class AcceptCustomerPortalInvitationDto {
  @IsString()
  @MinLength(1)
  token!: string;

  @IsString()
  @MinLength(8, { message: "Password must be at least 8 characters long" })
  @MaxLength(72)
  password!: string;
}
