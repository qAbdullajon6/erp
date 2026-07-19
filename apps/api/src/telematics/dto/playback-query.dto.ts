import { Type } from "class-transformer";
import { IsInt, IsISO8601, IsOptional, Max, Min } from "class-validator";

/// Historical playback of one vehicle's raw fixes over a time window. `from`
/// and `to` are required so the query is always range-bounded — an unbounded
/// scan of gps_positions is never allowed from the API.
export class PlaybackQueryDto {
  @IsISO8601()
  from!: string;

  @IsISO8601()
  to!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  limit: number = 5_000;
}
