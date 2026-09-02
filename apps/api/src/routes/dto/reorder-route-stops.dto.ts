import { IsArray, IsString, IsUUID, ArrayMinSize } from "class-validator";

/// Reorders route stops by providing the stop IDs in the desired sequence.
/// The array must contain exactly the current stop IDs (no additions or
/// omissions); the service maps position→sequence starting at 1.
export class ReorderRouteStopsDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID(undefined, { each: true })
  stopIds: string[];
}
