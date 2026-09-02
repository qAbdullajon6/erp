import { IsBoolean, IsOptional, IsUUID, ValidateIf } from 'class-validator';

export class UpdateRouteStopDto {
  @IsOptional()
  @IsBoolean()
  optimizationLocked?: boolean;

  @IsOptional()
  @ValidateIf((o: { dispatchId: unknown }) => o.dispatchId !== null)
  @IsUUID()
  dispatchId?: string | null;
}
