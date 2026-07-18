import { Type } from "class-transformer";
import {
  IsEnum,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { ImportDuplicateStrategy } from "@prisma/client";
import { IMPORT_ENTITY_TYPES } from "../registry/entity-registry";

export class CreateImportSessionDto {
  /// Validated against the registry rather than a hardcoded list, so a new
  /// entity type is accepted the moment it is registered.
  @IsIn(IMPORT_ENTITY_TYPES)
  entityType!: string;
}

export class SaveMappingDto {
  /// Column index -> field name, e.g. {"0":"companyName","2":"email"}. Values
  /// are checked against the entity's fields in MappingService.assertWellFormed;
  /// only the shape is checked here.
  @IsObject()
  columnMapping!: Record<string, string>;
}

export class SaveMappingTemplateDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsObject()
  columnMapping!: Record<string, string>;
}

export class ExecuteImportDto {
  @IsEnum(ImportDuplicateStrategy)
  duplicateStrategy!: ImportDuplicateStrategy;
}

export class ListImportsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsIn(IMPORT_ENTITY_TYPES)
  entityType?: string;

  @IsOptional()
  @IsIn(["PENDING", "VALIDATING", "VALIDATED", "EXECUTING", "COMPLETED", "FAILED", "CANCELLED"])
  status?: string;
}
