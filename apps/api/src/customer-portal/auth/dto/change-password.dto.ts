import { IsString, MaxLength, MinLength } from "class-validator";

export class CustomerPortalChangePasswordDto {
  @IsString()
  @MinLength(1)
  currentPassword!: string;

  @IsString()
  @MinLength(8, { message: "Password must be at least 8 characters long" })
  @MaxLength(72)
  newPassword!: string;
}
