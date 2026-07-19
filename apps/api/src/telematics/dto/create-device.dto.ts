import { TelematicsProviderType } from "@prisma/client";
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateDeviceDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsEnum(TelematicsProviderType)
  provider!: TelematicsProviderType;

  /// The device's id in the provider's system (the Traccar unit id, the
  /// Samsara vehicle id). Unique per (org, provider).
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  externalId!: string;

  /// The vehicle this unit is fitted to. Optional so a spare device can be
  /// registered before assignment.
  @IsOptional()
  @IsString()
  vehicleId?: string;
}
