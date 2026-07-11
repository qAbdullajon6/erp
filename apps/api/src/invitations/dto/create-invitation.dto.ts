import { IsEmail, IsEnum } from "class-validator";
import { MembershipRole } from "@prisma/client";

/// Body for POST /organizations/:organizationId/invitations. The organization
/// comes from the route (and must match the caller's token), and the inviter
/// from the authenticated user — so neither `organizationId` nor `invitedBy`
/// is ever accepted from the client. Same validation shape as AddMemberDto.
export class CreateInvitationDto {
  @IsEmail()
  email!: string;

  @IsEnum(MembershipRole)
  role!: MembershipRole;
}
