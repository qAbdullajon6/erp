import { BadRequestException } from "@nestjs/common";

export type ImportFileFormat = "csv" | "xlsx";

/// Maximum accepted upload. Enforced twice — by multer (which stops reading the
/// socket, so an oversized file never lands) and here (which catches anything
/// that reached us another way). 10 MB matches what the wizard tells the user.
export const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024;

/// ZIP local file header. XLSX is a zip container, so every real .xlsx starts
/// with these four bytes.
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
/// Legacy .xls (OLE2 compound document). Detected only to reject it with a
/// message that tells the user what to do, rather than failing as "not a CSV".
const OLE2_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0]);

/// Decides the format from the file's CONTENT, never its extension or the
/// client-supplied MIME type — both are attacker-controlled, and a .csv that
/// is really a zip should not be handed to a CSV parser (nor the reverse).
///
/// The extension is used only to break a genuine tie: a CSV has no magic
/// number, so "not a zip" is the strongest positive signal available for it.
export function detectFileFormat(buffer: Buffer, fileName: string): ImportFileFormat {
  if (buffer.length === 0) {
    throw new BadRequestException("File is empty");
  }

  if (buffer.length >= 4) {
    const magic = buffer.subarray(0, 4);

    if (magic.equals(ZIP_MAGIC)) return "xlsx";

    if (magic.equals(OLE2_MAGIC)) {
      throw new BadRequestException(
        "Legacy .xls files are not supported. Please re-save the file as .xlsx or .csv and upload it again.",
      );
    }
  }

  const extension = fileName.toLowerCase().split(".").pop() ?? "";

  if (extension === "xlsx" || extension === "xls") {
    // Claims to be Excel but is not a zip — either corrupt or mislabelled.
    throw new BadRequestException(
      "File has an Excel extension but is not a valid .xlsx file. Please re-save it and try again.",
    );
  }

  if (looksBinary(buffer)) {
    throw new BadRequestException(
      "Unsupported file type. Please upload a CSV or XLSX file.",
    );
  }

  return "csv";
}

/// A NUL byte in the first block means this is not text. Real CSVs — including
/// UTF-8 with any BOM or accented characters — never contain one; binaries
/// almost always do within the first few hundred bytes.
function looksBinary(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, Math.min(buffer.length, 512));
  return sample.includes(0x00);
}

export function assertFileSizeWithinLimit(sizeBytes: number): void {
  if (sizeBytes > MAX_IMPORT_FILE_BYTES) {
    const limitMb = Math.floor(MAX_IMPORT_FILE_BYTES / (1024 * 1024));
    throw new BadRequestException(`File is too large. Maximum size is ${limitMb} MB.`);
  }
}
