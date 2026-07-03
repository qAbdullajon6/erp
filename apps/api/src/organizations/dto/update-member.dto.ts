import { IsEnum, IsOptional } from "class-validator";
import { MembershipRole, MembershipStatus } from "@prisma/client";

export class UpdateMemberDto {
  @IsOptional()
  @IsEnum(MembershipRole)
  role?: MembershipRole;

  @IsOptional()
  @IsEnum(MembershipStatus)
  status?: MembershipStatus;
}
