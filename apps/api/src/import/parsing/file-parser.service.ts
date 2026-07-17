import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { Readable } from "stream";
import Papa from "papaparse";
import ExcelJS from "exceljs";
import type { ImportFileFormat } from "./file-format.util";
import { cellToText } from "../registry/field-types";

/// A row as it came out of the file: header -> cell text.
export type RawRow = Record<string, string>;

export interface ParsedHeader {
  headers: string[];
}

/// Hard ceiling on rows per file. Above this the user should split the file:
/// a single import that large stops being resumable in a useful timeframe and
/// its error report stops being something a human can act on. Stated in the
/// error rather than silently truncating — truncation would import a subset
/// while reporting success.
export const MAX_IMPORT_ROWS = 100_000;

/// Guards against a pathological file with thousands of columns, which would
/// otherwise turn every row into a huge JSON blob in import_rows.
const MAX_COLUMNS = 200;

@Injectable()
export class FileParserService {
  private readonly logger = new Logger(FileParserService.name);

  /// Streams the file, invoking `onRow` per data row.
  ///
  /// The callback shape is the whole point: nothing here ever holds more than
  /// one row plus the header. A 50k-row file is processed in constant memory,
  /// and the caller decides what to accumulate (the parse step batches rows
  /// into the database and keeps only a small preview).
  ///
  /// `onRow` may be async; it is awaited, which also applies backpressure to
  /// the XLSX reader.
  async parse(
    buffer: Buffer,
    format: ImportFileFormat,
    onRow: (row: RawRow, rowNumber: number) => Promise<void> | void,
  ): Promise<ParsedHeader> {
    return format === "csv"
      ? this.parseCsv(buffer, onRow)
      : this.parseXlsx(buffer, onRow);
  }

  private async parseCsv(
    buffer: Buffer,
    onRow: (row: RawRow, rowNumber: number) => Promise<void> | void,
  ): Promise<ParsedHeader> {
    // Strip a UTF-8 BOM: Papa would otherwise fold it into the first header
    // name, so "Company Name" arrives BOM-prefixed and matches no alias. Excel
    // writes one by default, so this is the common case, not an edge case.
    let text = buffer.toString("utf8");
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

    // header:false, and the header row is taken from the data.
    //
    // Papa's header:true mode SILENTLY RENAMES a duplicate column ("Company
    // Name" twice becomes "Company Name" and "Company Name_1"), which defeats
    // any duplicate check downstream and quietly drops the second column's
    // data. Reading raw arrays is also what makes this path symmetric with the
    // XLSX one, which has always worked positionally.
    const result = Papa.parse<string[]>(text, {
      header: false,
      skipEmptyLines: "greedy",
      // Everything stays a string. Papa's dynamicTyping would coerce by
      // guessing, and its guesses are wrong in ways that matter here: a
      // postcode "01234" becomes 1234, and an order number "1e5" becomes
      // 100000. Coercion belongs to the field's declared type, not the parser.
      dynamicTyping: false,
    });

    // Papa reports structural problems rather than throwing. A quoting error
    // means every subsequent row is misaligned, so it is fatal for the file —
    // importing shifted data is worse than refusing it.
    const fatal = result.errors.find((e) => e.type === "Quotes" || e.code === "MissingQuotes");
    if (fatal) {
      throw new BadRequestException(
        `File has a malformed quoted value on line ${(fatal.row ?? 0) + 1}. Check for an unclosed quote.`,
      );
    }

    const rows = result.data;
    if (rows.length === 0) throw new BadRequestException("File has no header row");

    const headers = rows[0].map((h) => String(h ?? "").trim());
    while (headers.length > 0 && headers[headers.length - 1] === "") headers.pop();
    this.assertHeaders(headers);

    let rowNumber = 0;
    for (const cells of rows.slice(1)) {
      if (cells.every((c) => String(c ?? "").trim() === "")) continue;

      const record: RawRow = {};
      for (const [i, header] of headers.entries()) {
        if (!header) continue;
        record[header] = String(cells[i] ?? "");
      }

      rowNumber += 1;
      this.assertRowCount(rowNumber);
      await onRow(record, rowNumber);
    }

    return { headers };
  }

  private async parseXlsx(
    buffer: Buffer,
    onRow: (row: RawRow, rowNumber: number) => Promise<void> | void,
  ): Promise<ParsedHeader> {
    try {
      return await this.readXlsx(buffer, onRow);
    } catch (err) {
      // Our own rejections are already the right message and status.
      if (err instanceof BadRequestException) throw err;

      // Anything else means ExcelJS could not make sense of the bytes — a
      // truncated upload, a zip that is not a workbook, an encrypted file.
      // That is the user's file being wrong, not the server failing, so it must
      // not surface as a 500.
      this.logger.warn(
        `XLSX parse failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new BadRequestException(
        "File could not be read as an Excel workbook. It may be corrupt, password-protected, or not a real .xlsx file.",
      );
    }
  }

  private async readXlsx(
    buffer: Buffer,
    onRow: (row: RawRow, rowNumber: number) => Promise<void> | void,
  ): Promise<ParsedHeader> {
    // The streaming reader, not Workbook.xlsx.load(): the latter materialises
    // the entire sheet as objects before yielding anything, which is precisely
    // the "no full-file loading into memory" this must avoid.
    const reader = new ExcelJS.stream.xlsx.WorkbookReader(Readable.from(buffer), {
      // Shared strings must be cached — in XLSX every text cell is a pointer
      // into a shared table, and without it cells come back as ids.
      sharedStrings: "cache",
      // We never read styles, and parsing them on a wide sheet is pure cost.
      styles: "ignore",
      entries: "emit",
      worksheets: "emit",
    });

    let headers: string[] = [];
    let rowNumber = 0;
    let sawSheet = false;

    for await (const worksheet of reader) {
      // Only the first sheet. A workbook's later sheets are typically lookups
      // or notes; importing them as if they were more data rows would be
      // surprising and wrong.
      if (sawSheet) break;
      sawSheet = true;

      for await (const row of worksheet) {
        const cells = this.readRowCells(row);

        if (headers.length === 0) {
          // Skip leading blank rows before the header — common in exports that
          // carry a title block.
          if (cells.every((c) => c === "")) continue;
          headers = cells.map((c) => c.trim());
          // Trailing empties come from Excel's used-range being wider than the
          // real data; they are not columns.
          while (headers.length > 0 && headers[headers.length - 1] === "") headers.pop();
          this.assertHeaders(headers);
          continue;
        }

        const record: RawRow = {};
        let blank = true;
        for (const [i, header] of headers.entries()) {
          if (!header) continue;
          const value = cells[i] ?? "";
          record[header] = value;
          if (value !== "") blank = false;
        }
        if (blank) continue;

        rowNumber += 1;
        this.assertRowCount(rowNumber);
        await onRow(record, rowNumber);
      }
    }

    if (!sawSheet) throw new BadRequestException("Workbook contains no sheets");
    if (headers.length === 0) throw new BadRequestException("File has no header row");

    return { headers };
  }

  /// Renders a cell as the text a human sees in the spreadsheet.
  ///
  /// The formula case is the important one: for `=A1+B1` ExcelJS gives both the
  /// formula and its cached `result`. We take the RESULT, because the user's
  /// intent is the number they see — importing the literal "=A1+B1" would be
  /// nonsense, and their spreadsheet's totals are frequently computed.
  private readRowCells(row: ExcelJS.Row): string[] {
    const out: string[] = [];
    // row.cellCount is the last populated column; iterate positionally so an
    // empty cell keeps its column index rather than shifting later values left.
    for (let i = 1; i <= row.cellCount; i++) {
      out.push(this.cellToString(row.getCell(i)));
    }
    return out;
  }

  private cellToString(cell: ExcelJS.Cell): string {
    const value: unknown = cell.value;

    if (value === null || value === undefined) return "";
    if (value instanceof Date) {
      // Excel dates are datetimes; the date part is what was meant.
      return value.toISOString().slice(0, 10);
    }
    if (typeof value === "object") {
      const obj = value as Record<string, unknown>;
      // Formula cell: prefer the cached result.
      if ("result" in obj) {
        const result = obj.result;
        if (result instanceof Date) return result.toISOString().slice(0, 10);
        if (result === null || result === undefined) return "";
        // A formula whose cached result is an error (#REF!, #DIV/0!) surfaces
        // as {error}. Empty is right: the sheet has no value here, and
        // "#DIV/0!" would fail validation with a baffling message.
        if (typeof result === "object" && result !== null && "error" in result) return "";
        return cellToText(result);
      }
      if ("error" in obj) return "";
      // Rich text: concatenate the runs into the plain text shown in the cell.
      if ("richText" in obj && Array.isArray(obj.richText)) {
        return (obj.richText as Array<{ text?: string }>).map((r) => r.text ?? "").join("");
      }
      if ("text" in obj && typeof obj.text === "string") return obj.text;
      if ("hyperlink" in obj && typeof obj.text === "string") return obj.text;
      return "";
    }
    return cellToText(value);
  }

  private assertHeaders(headers: string[]): void {
    if (headers.length === 0) {
      throw new BadRequestException("File has no header row");
    }
    if (headers.length > MAX_COLUMNS) {
      throw new BadRequestException(
        `File has ${headers.length} columns, which exceeds the ${MAX_COLUMNS}-column limit.`,
      );
    }
    const seen = new Set<string>();
    for (const header of headers) {
      const key = header.toLowerCase();
      if (seen.has(key)) {
        // Two identical headers make the mapping ambiguous and silently drop
        // one column's data — better to say so than to guess.
        throw new BadRequestException(
          `File has a duplicate column header: "${header}". Column names must be unique.`,
        );
      }
      seen.add(key);
    }
  }

  private assertRowCount(rowNumber: number): void {
    if (rowNumber > MAX_IMPORT_ROWS) {
      throw new BadRequestException(
        `File exceeds the ${MAX_IMPORT_ROWS.toLocaleString("en-US")}-row limit. Please split it into smaller files.`,
      );
    }
  }
}
