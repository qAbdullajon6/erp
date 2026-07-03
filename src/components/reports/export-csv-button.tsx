"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadCsv, type CsvRow } from "@/lib/csv-export";

export function ExportCsvButton({
  filename,
  rows,
  label = "Export CSV",
}: {
  filename: string;
  rows: CsvRow[];
  label?: string;
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-1.5"
      disabled={rows.length === 0}
      onClick={() => downloadCsv(filename, rows)}
    >
      <Download className="size-3.5" />
      {label}
    </Button>
  );
}
