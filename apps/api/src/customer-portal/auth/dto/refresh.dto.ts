import { IsString, MinLength } from "class-validator";

export class CustomerPortalRefreshDto {
  @IsString()
  @MinLength(1)
  refreshToken!: string;
}
