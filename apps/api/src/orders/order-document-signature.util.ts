/// Verifies uploaded file content actually matches its declared MIME type via
/// magic-byte signatures, instead of trusting Multer's `file.mimetype` alone
/// — that value comes straight from the client-supplied Content-Type of the
/// multipart part and is fully spoofable.
export function matchesDeclaredMimeType(buffer: Buffer, mimeType: string): boolean {
  const bytes = buffer.subarray(0, 16);

  switch (mimeType) {
    case "application/pdf":
      return bytes.subarray(0, 5).toString("latin1") === "%PDF-";
    case "image/jpeg":
      return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    case "image/png":
      return (
        bytes[0] === 0x89 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x4e &&
        bytes[3] === 0x47 &&
        bytes[4] === 0x0d &&
        bytes[5] === 0x0a &&
        bytes[6] === 0x1a &&
        bytes[7] === 0x0a
      );
    case "image/gif": {
      const header = bytes.subarray(0, 6).toString("latin1");
      return header === "GIF87a" || header === "GIF89a";
    }
    case "image/webp":
      return (
        bytes.subarray(0, 4).toString("latin1") === "RIFF" &&
        buffer.subarray(8, 12).toString("latin1") === "WEBP"
      );
    case "application/msword":
    case "application/vnd.ms-excel":
      // Legacy OLE Compound File binary format (pre-2007 Office .doc/.xls).
      return (
        bytes[0] === 0xd0 &&
        bytes[1] === 0xcf &&
        bytes[2] === 0x11 &&
        bytes[3] === 0xe0 &&
        bytes[4] === 0xa1 &&
        bytes[5] === 0xb1 &&
        bytes[6] === 0x1a &&
        bytes[7] === 0xe1
      );
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      // Modern Office formats (.docx/.xlsx) are ZIP containers.
      return bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07);
    case "text/plain":
      // Free-form text has no signature — reject a null byte in the first
      // chunk instead, which real UTF-8/ASCII text never contains.
      return !buffer.subarray(0, Math.min(buffer.length, 8000)).includes(0);
    default:
      return false;
  }
}
