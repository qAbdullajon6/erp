import { IsOptional, IsString, MaxLength } from "class-validator";

export class RejectExpenseDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  rejectionReason?: string;
}
