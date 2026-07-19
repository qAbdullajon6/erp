import { Type } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";

export class TripReplayQueryDto {
  /// Cap on returned points. A long-haul trip can hold tens of thousands of
  /// fixes; the client asks for a bounded window and can page/downsample.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  limit: number = 5_000;
}
