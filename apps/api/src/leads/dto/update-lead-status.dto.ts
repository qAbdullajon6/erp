import { LeadStatus } from "@prisma/client";
import { IsEnum } from "class-validator";

/// Any status may follow any other. A sales pipeline is not a forward-only
/// state machine like Order or Dispatch: a lead that was closed can be
/// reopened when the company comes back, and one contacted by mistake can be
/// pushed back to NEW.
export class UpdateLeadStatusDto {
  @IsEnum(LeadStatus)
  status!: LeadStatus;
}
