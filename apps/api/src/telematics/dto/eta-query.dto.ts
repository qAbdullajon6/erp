import { Type } from "class-transformer";
import { IsNumber, Max, Min } from "class-validator";

/// Destination coordinates for an ETA query. Supplied by the caller because the
/// system stores delivery addresses as text, not coordinates — see
/// TelematicsService.estimateEta.
export class EtaQueryDto {
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng!: number;
}
