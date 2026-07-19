import { Transform, Type } from "class-transformer";
import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

function parseBool({ value }: { value: unknown }): boolean {
  return value === "true" || value === true;
}

export class ListGeofencesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @Transform(parseBool)
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @Transform(parseBool)
  @IsBoolean()
  includeArchived: boolean = false;
}
