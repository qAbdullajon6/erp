import { IsBoolean, IsOptional, IsUUID, ValidateIf } from 'class-validator';

export class UpdateRouteStopDto {
  @IsOptional()
  @IsBoolean()
  optimizationLocked?: boolean;

  @IsOptional()
  @ValidateIf((o) => o.dispatchId !== null)
  @IsUUID()
  dispatchId?: string | null;
}
