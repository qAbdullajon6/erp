import { IsBoolean, IsEmail, IsUUID } from "class-validator";

export class SetPlatformAdminDto {
  @IsUUID()
  userId!: string;

  @IsBoolean()
  isPlatformAdmin!: boolean;
}

export class FindStaffQueryDto {
  @IsEmail()
  email!: string;
}
