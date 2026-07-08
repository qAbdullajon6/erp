import { IsIn } from "class-validator";
import { ReportFilterDto } from "./report-filter.dto";

export const EXPORT_REPORT_TYPES = ["executive-overview", "operations", "financial"] as const;
export type ExportReportType = (typeof EXPORT_REPORT_TYPES)[number];

export class ExportReportQueryDto extends ReportFilterDto {
  @IsIn(EXPORT_REPORT_TYPES)
  type!: ExportReportType;
}
