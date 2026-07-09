import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

/// Submitted by anonymous visitors from the marketing site, so every field is
/// length-capped: this is the only unauthenticated write endpoint in the API.
export class CreateLeadDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  company!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  phone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  source?: string;
}
