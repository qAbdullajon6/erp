import { IsString, MaxLength, MinLength } from "class-validator";

export class ValidateResetTokenDto {
  @IsString()
  @MinLength(43)
  @MaxLength(128)
  token!: string;
}
