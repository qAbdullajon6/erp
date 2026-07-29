/// Minimal Excel-compatible export without a third-party dependency.
/// Uses SpreadsheetML (XML) which Excel opens natively.
export function toExcelXml<T extends Record<string, unknown>>(
  rows: T[],
  columns: { key: keyof T; label: string }[],
): string {
  const escapeXml = (value: unknown): string => {
    const str = value === null || value === undefined ? "" : String(value);
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  };

  const headerCells = columns
    .map((c) => `<Cell><Data ss:Type="String">${escapeXml(c.label)}</Data></Cell>`)
    .join("");
  const dataRows = rows
    .map((row) => {
      const cells = columns
        .map((c) => `<Cell><Data ss:Type="String">${escapeXml(row[c.key])}</Data></Cell>`)
        .join("");
      return `<Row>${cells}</Row>`;
    })
    .join("");

  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="Orders">
  <Table>
   <Row>${headerCells}</Row>
   ${dataRows}
  </Table>
 </Worksheet>
</Workbook>`;
}

export function downloadExcel(filename: string, content: string): void {
  const blob = new Blob([content], { type: "application/vnd.ms-excel" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".xls") ? filename : `${filename}.xls`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
