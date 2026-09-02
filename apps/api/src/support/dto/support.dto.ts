import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { Type } from "class-transformer";

export class CreateTicketDto {
  @IsString()
  @MinLength(3, { message: "Subject must be at least 3 characters" })
  @MaxLength(200)
  subject!: string;

  @IsString()
  @MinLength(10, { message: "Description must be at least 10 characters" })
  @MaxLength(5000)
  body!: string;
}

export class CreateMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body!: string;
}

export class ListTicketsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;
}
