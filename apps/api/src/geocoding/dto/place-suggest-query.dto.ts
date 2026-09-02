import { Transform } from "class-transformer";
import { IsInt, IsOptional, IsString, Matches, MaxLength, Min, Max } from "class-validator";
import { emptyToUndefined } from "../../common/query-transform.util";

export class PlaceSuggestQueryDto {
  @IsString()
  @MaxLength(100)
  q!: string;

  /// ISO 3166-1 alpha-2 country code — restricts suggestions to a single country.
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(2)
  @Matches(/^[A-Za-z]{2}$/, { message: "country must be a 2-letter ISO alpha-2 code" })
  country?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    const n = typeof value === "number" ? value : Number(value);
    return Number.isFinite(n) ? n : 5;
  })
  @IsInt()
  @Min(1)
  @Max(10)
  limit: number = 5;
}
