import { DriverDocumentType, DriverLicenseClass } from "@prisma/client";
import { IsDateString, IsEnum, IsOptional, IsString, MaxLength } from "class-validator";

export class CreateDriverDocumentDto {
  @IsEnum(DriverDocumentType)
  type!: DriverDocumentType;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  documentNumber?: string;

  @IsOptional()
  @IsDateString()
  issueDate?: string;

  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  @IsOptional()
  @IsEnum(DriverLicenseClass)
  licenseClass?: DriverLicenseClass;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  endorsements?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
