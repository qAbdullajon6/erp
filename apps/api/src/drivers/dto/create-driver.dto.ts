import { DriverDocumentType, DriverLicenseClass, EmploymentType, WorkShift } from "@prisma/client";
import {
  IsArray,
  IsDateString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

export class CreateEmergencyContactDto {
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  relationship!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  phone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  alternatePhone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;
}

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
  @IsString()
  @MaxLength(255)
  fileName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  fileUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class CreateDriverDto {
  /// Omit to auto-generate the next sequential EMP-0001-style code for this
  /// organization; provide to set one explicitly (validated for format and
  /// per-organization uniqueness) — same pattern as Customer.customerCode.
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Matches(/^[A-Za-z0-9][A-Za-z0-9-]*$/, {
    message: "employeeCode may only contain letters, numbers and hyphens",
  })
  employeeCode?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  phone!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  profilePhotoUrl?: string;

  // License
  @IsOptional()
  @IsString()
  @MaxLength(100)
  licenseNumber?: string;

  @IsOptional()
  @IsEnum(DriverLicenseClass)
  licenseClass?: DriverLicenseClass;

  @IsOptional()
  @IsDateString()
  licenseIssueDate?: string;

  @IsOptional()
  @IsDateString()
  licenseExpiry?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  licenseEndorsements?: string;

  // Employment
  @IsOptional()
  @IsEnum(EmploymentType)
  employmentType?: EmploymentType;

  @IsOptional()
  @IsDateString()
  hireDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  department?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  baseLocation?: string;

  @IsOptional()
  @IsEnum(WorkShift)
  workShift?: WorkShift;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  preferredRegions?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  availableDays?: string[];

  // Notes
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  driverNotes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  internalNotes?: string;

  // Relations
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateEmergencyContactDto)
  emergencyContact?: CreateEmergencyContactDto;
}
