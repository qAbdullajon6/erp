import { Type } from "class-transformer";
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export class CreateConversationDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  /// Pins the thread to a model. Validated against the active provider's list
  /// by ProviderFactory.resolveModel — a model from a vendor the deployment has
  /// switched away from falls back to the default rather than failing.
  @IsOptional()
  @IsString()
  @MaxLength(100)
  model?: string;

  /// When true, creates an observation-only conversation: the model can search
  /// and analyse but cannot create, update or delete anything.
  @IsOptional()
  @IsBoolean()
  readOnly?: boolean;
}

export class SendMessageDto {
  @IsString()
  @MinLength(1)
  // Oversize is rejected in the service with a message about asking something
  // shorter; this is the blunt outer bound that keeps a megabyte of text from
  // being parsed at all.
  @MaxLength(8000)
  message!: string;
}

export class RenameConversationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;
}

export class SetPinnedDto {
  @IsBoolean()
  pinned!: boolean;
}

export class SetStatusDto {
  @IsIn(["ACTIVE", "ARCHIVED"])
  status!: "ACTIVE" | "ARCHIVED";
}

export class ListConversationsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsIn(["ACTIVE", "ARCHIVED"])
  status?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  pinned?: boolean;
}

export class RememberDto {
  @IsIn(["PINNED", "PREFERENCE"])
  kind!: "PINNED" | "PREFERENCE";

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  content!: string;
}
