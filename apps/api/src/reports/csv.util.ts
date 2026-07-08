/// Minimal, dependency-free CSV serialization (RFC 4180-ish): a field is
/// quoted whenever it contains a comma, double-quote, or newline, and any
/// internal double-quote is doubled. `null`/`undefined` become empty
/// fields, not the string "null".
function escapeCsvField(value: string | number | boolean | Date | null | undefined): string {
  if (value === null || value === undefined) return "";
  const text = value instanceof Date ? value.toISOString() : `${value}`;
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsv(
  headers: string[],
  rows: (string | number | boolean | Date | null | undefined)[][],
): string {
  const lines = [headers.map(escapeCsvField).join(",")];
  for (const row of rows) {
    lines.push(row.map(escapeCsvField).join(","));
  }
  // CRLF line endings — the conventional CSV default (RFC 4180) and what
  // spreadsheet software expects without guessing.
  return lines.join("\r\n") + "\r\n";
}

/// A safe filename derived from the organization's slug, the report type,
/// and the current date — no path separators, no characters that would
/// need escaping in a Content-Disposition header.
export function reportCsvFilename(organizationSlug: string, reportType: string): string {
  const safeSlug = organizationSlug.replace(/[^a-z0-9-]/gi, "-");
  const datePart = new Date().toISOString().slice(0, 10);
  return `${safeSlug}-${reportType}-${datePart}.csv`;
}
