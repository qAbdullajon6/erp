import { IsArray, IsUUID, ArrayMaxSize } from "class-validator";

export class BatchDispatchConflictsDto {
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID("4", { each: true })
  ids!: string[];
}
