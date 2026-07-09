import { IsOptional, IsString } from "class-validator";

export class UpdateDispatchDto {
  @IsOptional()
  @IsString()
  notes?: string;
}
