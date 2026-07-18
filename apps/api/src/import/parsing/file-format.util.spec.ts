import { BadRequestException } from "@nestjs/common";
import {
  assertFileSizeWithinLimit,
  detectFileFormat,
  MAX_IMPORT_FILE_BYTES,
} from "./file-format.util";

const zip = (extra = "") => Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from(extra)]);
const ole2 = () => Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

describe("detectFileFormat", () => {
  it("detects xlsx from the zip magic number, whatever the name says", () => {
    // Content over extension: the extension is attacker-controlled, and a .csv
    // that is really a zip must not be handed to the CSV parser.
    expect(detectFileFormat(zip(), "data.xlsx")).toBe("xlsx");
    expect(detectFileFormat(zip(), "lying.csv")).toBe("xlsx");
    expect(detectFileFormat(zip(), "noextension")).toBe("xlsx");
  });

  it("detects csv from plain text", () => {
    expect(detectFileFormat(Buffer.from("a,b\n1,2"), "data.csv")).toBe("csv");
    expect(detectFileFormat(Buffer.from("a,b\n1,2"), "data.txt")).toBe("csv");
  });

  it("accepts a UTF-8 BOM and accented text as csv", () => {
    expect(detectFileFormat(Buffer.from("﻿nom,ville\nAcmé,Genève"), "d.csv")).toBe("csv");
  });

  it("rejects legacy .xls with an actionable message", () => {
    // Detected only so the user is told what to do, rather than failing as
    // "not a CSV".
    expect(() => detectFileFormat(ole2(), "old.xls")).toThrow(/re-save the file as \.xlsx or \.csv/i);
  });

  it("rejects an Excel-named file that is not a zip", () => {
    expect(() => detectFileFormat(Buffer.from("not a workbook"), "fake.xlsx")).toThrow(
      /not a valid \.xlsx/i,
    );
  });

  it("rejects binary content", () => {
    // A NUL in the first block means this is not text. Real CSVs never have one.
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x00, 0x1a]);
    expect(() => detectFileFormat(png, "image.png")).toThrow(/unsupported file type/i);
  });

  it("rejects an empty file", () => {
    expect(() => detectFileFormat(Buffer.alloc(0), "empty.csv")).toThrow(BadRequestException);
  });

  it("accepts a tiny file that is shorter than the magic number", () => {
    expect(detectFileFormat(Buffer.from("a"), "a.csv")).toBe("csv");
  });
});

describe("assertFileSizeWithinLimit", () => {
  it("accepts a file at exactly the limit", () => {
    expect(() => assertFileSizeWithinLimit(MAX_IMPORT_FILE_BYTES)).not.toThrow();
  });

  it("rejects one byte over, and names the limit", () => {
    expect(() => assertFileSizeWithinLimit(MAX_IMPORT_FILE_BYTES + 1)).toThrow(/Maximum size is 10 MB/);
  });
});
