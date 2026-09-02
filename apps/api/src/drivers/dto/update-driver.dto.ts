import { DriverLicenseClass, DriverStatus, EmploymentType, WorkShift } from "@prisma/client";
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
import { CreateEmergencyContactDto } from "./create-driver.dto";

export class UpdateDriverDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Matches(/^[A-Za-z0-9][A-Za-z0-9-]*$/, {
    message: "employeeCode may only contain letters, numbers and hyphens",
  })
  employeeCode?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsEnum(DriverStatus)
  status?: DriverStatus;

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
