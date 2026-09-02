import { IsISO8601, IsString } from 'class-validator';

export class ApplyOptimizationDto {
  @IsString()
  @IsISO8601()
  routeUpdatedAt!: string;
}
