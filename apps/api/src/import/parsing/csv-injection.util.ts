/// CSV / formula injection protection.
///
/// The threat runs in both directions, and they need different treatment:
///
///  INBOUND  — a cell in an uploaded file reads `=cmd|'/c calc'!A1`. If that
///             string is stored and later re-exported, whoever opens the export
///             in Excel executes it. The value is data to us, so we neutralise
///             the leading trigger character on the way in.
///
///  OUTBOUND — we generate CSVs ourselves (the error report and the template).
///             Anything user-controlled in those (a company name, a bad value
///             echoed back) is the same hazard. Same neutralisation, applied at
///             write time.
///
/// Both directions go through `neutralizeFormula`. Escaping only on output
/// would leave the payload sitting in the database for any other consumer to
/// re-export; escaping only on input would leave our own generated files
/// unsafe when the payload arrives some other way.

/// The characters Excel/Sheets/LibreOffice treat as "this cell is a formula".
/// `-` and `+` are included because `-1+1` is a formula to Excel, and `@` is
/// the legacy Lotus-style trigger that Excel still honours.
const FORMULA_TRIGGERS = ["=", "+", "-", "@"];

/// Control characters that also start a formula context in some spreadsheet
/// software when they lead a cell (tab and carriage return).
const CONTROL_TRIGGERS = ["\t", "\r"];

/// Prefixes a single quote when the value would otherwise be parsed as a
/// formula. Excel renders a leading apostrophe as "treat the rest as text" and
/// does not display it, so the user still sees what they typed.
///
/// Returns non-strings untouched: numbers and dates cannot carry a payload,
/// and stringifying them here would corrupt their type.
export function neutralizeFormula<T>(value: T): T | string {
  if (typeof value !== "string") return value;
  if (value.length === 0) return value;

  const first = value[0];
  if (FORMULA_TRIGGERS.includes(first) || CONTROL_TRIGGERS.includes(first)) {
    return `'${value}`;
  }

  return value;
}

/// True when the value would be executed by a spreadsheet as a formula.
/// Exported so validation can raise a WARNING telling the user their file
/// contains formulas that were imported as literal text — silently rewriting
/// their data without saying so would be worse than the injection.
export function looksLikeFormula(value: unknown): boolean {
  if (typeof value !== "string" || value.length === 0) return false;
  const first = value[0];
  return FORMULA_TRIGGERS.includes(first) || CONTROL_TRIGGERS.includes(first);
}

/// Renders one row as a CSV line: neutralises formulas, then quotes.
///
/// Quoting is unconditional rather than only-when-needed. A conditional
/// implementation has to decide what "needed" means and is exactly where CSV
/// writers get it wrong; always-quote is correct for every input and costs two
/// bytes a field.
export function toCsvRow(values: unknown[]): string {
  return values
    .map((value) => {
      const text = renderCell(value);
      const safe = neutralizeFormula(text);
      // RFC 4180: a literal quote inside a quoted field is doubled.
      return `"${safe.replace(/"/g, '""')}"`;
    })
    .join(",");
}

/// Renders a cell for output. Anything non-scalar becomes empty rather than the
/// literal "[object Object]", which is what a blind String() would write into
/// the file and show the user as though it were their data.
function renderCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "bigint" || typeof value === "boolean") {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();
  return "";
}

/// A complete CSV document with CRLF line endings (RFC 4180) and a UTF-8 BOM.
///
/// The BOM is what makes Excel open a UTF-8 CSV correctly on Windows; without
/// it, non-ASCII company names arrive mojibake'd, which for an error report
/// means the user cannot find the row it is telling them about.
export function toCsvDocument(header: string[], rows: unknown[][]): string {
  const lines = [toCsvRow(header), ...rows.map((row) => toCsvRow(row))];
  // Written as the \uFEFF escape rather than a literal BOM: a raw BOM in source
  // is invisible to whoever reads this next.
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
