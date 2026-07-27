import { IsUUID } from "class-validator";

export class LinkDriverUserDto {
  @IsUUID()
  userId!: string;
}
