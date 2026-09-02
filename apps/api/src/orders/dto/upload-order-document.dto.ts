import { OrderDocumentKind } from "@prisma/client";
import { IsEnum, IsOptional } from "class-validator";

export class UploadOrderDocumentDto {
  @IsOptional()
  @IsEnum(OrderDocumentKind)
  kind?: OrderDocumentKind;
}
