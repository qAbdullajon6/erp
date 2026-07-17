/// The vocabulary an entity definition is written in.
///
/// A field declares a `type`, and the type decides how a raw spreadsheet cell
/// becomes a typed value and what counts as invalid. Keeping coercion in the
/// type — rather than in per-entity code — is what lets a new entity be added
/// as data (see entity-registry.ts) instead of as another parser.

export type FieldType =
  | "string"
  | "email"
  | "phone"
  | "integer"
  | "decimal"
  | "date"
  | "boolean"
  | "enum"
  | "currency"
  | "reference";

/// Resolves a human-typed reference ("ACME-001", "john@x.com") to an entity id.
/// Returns null when nothing matches — the caller turns that into an
/// "Unknown customer"-style error naming the value the user actually typed.
export type ReferenceResolver = (
  organizationId: string,
  rawValue: string,
) => Promise<string | null>;

export interface FieldDefinition {
  /// The property name on the entity being created.
  fieldName: string;
  /// What the user sees in the mapping dropdown.
  label: string;
  type: FieldType;
  required: boolean;
  /// Header spellings that auto-map to this field, lowercased. Matching is
  /// exact against the normalized header — see auto-map in mapping.service.ts.
  aliases: string[];
  /// enum only: the permitted values.
  enumValues?: readonly string[];
  /// reference only: which entity is pointed at, used for the error message
  /// ("Unknown customer") and to pick the resolver.
  referenceEntity?: "Customer" | "Driver" | "Vehicle" | "Order";
  /// decimal/integer only.
  min?: number;
  max?: number;
  maxLength?: number;
  /// Written when the column is absent or the cell is blank. Only meaningful
  /// for optional fields.
  defaultValue?: unknown;
  /// Shown in the generated CSV template's example row.
  example?: string;
}

export interface CoercionResult {
  ok: boolean;
  value?: unknown;
  /// Present when ok is false. Phrased for a non-technical user looking at a
  /// spreadsheet, e.g. "must be a date (try 2026-07-17)".
  error?: string;
}

const TRUE_VALUES = new Set(["true", "yes", "y", "1", "t"]);
const FALSE_VALUES = new Set(["false", "no", "n", "0", "f"]);

/// ISO 4217 alpha-3. Not exhaustive — the set a logistics customer in this
/// product's markets plausibly bills in. An unlisted-but-real currency is a
/// registry edit, not a code change.
const KNOWN_CURRENCIES = new Set([
  "USD", "EUR", "GBP", "UZS", "RUB", "KZT", "TRY", "CNY", "AED", "PLN",
  "CHF", "JPY", "INR", "UAH", "GEL", "AZN", "KGS", "TJS", "TMT",
]);

/// Only these three shapes are accepted, and deliberately not free-form
/// Date.parse: `Date.parse("01/02/2026")` silently means January 2nd to a US
/// runtime and February 1st to a European user, so accepting it would corrupt
/// dates without ever erroring.
///
/// Each accepted form has exactly one reading:
///   ISO        2026-07-17   — unambiguous by definition
///   DMY dots   17.07.2026   — the dot separator is European convention; nobody
///                             writes MM.DD.YYYY
///   YMD slash  2026/07/17   — a leading 4-digit year fixes the order
///
/// SLASH-separated day/month forms (01/02/2026) are deliberately REJECTED
/// rather than assumed: that is the ambiguity above, and a wrong date that
/// imports cleanly is worse than one that is refused with a message naming the
/// formats we take.
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/;
const DMY_DATE = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;
const YMD_SLASH = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/;

/// Renders an arbitrary cell value as the text a user would recognise.
///
/// A blind String() turns an object into the literal "[object Object]", which
/// would then be validated, stored, and shown back to the user as if it were
/// their data. Anything that is not a primitive is treated as empty — a cell
/// that is not scalar is not a value this importer can carry.
export function cellToText(raw: unknown): string {
  if (raw === null || raw === undefined) return "";
  if (typeof raw === "string") return raw.trim();
  if (typeof raw === "number" || typeof raw === "bigint" || typeof raw === "boolean") {
    return String(raw);
  }
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  return "";
}

export function coerceValue(raw: unknown, field: FieldDefinition): CoercionResult {
  const text = cellToText(raw);

  if (text === "") {
    if (field.required) return { ok: false, error: `${field.label} is required` };
    return { ok: true, value: field.defaultValue ?? null };
  }

  switch (field.type) {
    case "string":
      if (field.maxLength && text.length > field.maxLength) {
        return { ok: false, error: `${field.label} must be at most ${field.maxLength} characters` };
      }
      return { ok: true, value: text };

    case "email": {
      // Deliberately not an RFC 5322 regex: those are enormous, and the ones
      // people paste are subtly wrong. This rejects what a human would call
      // obviously-not-an-email and lets the rest through.
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(text)) {
        return { ok: false, error: `${field.label} is not a valid email address` };
      }
      if (text.length > 320) return { ok: false, error: `${field.label} is too long` };
      return { ok: true, value: text.toLowerCase() };
    }

    case "phone": {
      // Punctuation people actually type is stripped rather than rejected —
      // "+1 (555) 010-9999" is a valid phone number to everyone except a regex.
      const digits = text.replace(/[\s()\-.]/g, "");
      if (!/^\+?\d{7,15}$/.test(digits)) {
        return { ok: false, error: `${field.label} is not a valid phone number (7-15 digits)` };
      }
      return { ok: true, value: digits };
    }

    case "integer": {
      if (!/^-?\d+$/.test(text)) {
        return { ok: false, error: `${field.label} must be a whole number` };
      }
      const n = Number.parseInt(text, 10);
      if (!Number.isSafeInteger(n)) return { ok: false, error: `${field.label} is out of range` };
      if (field.min !== undefined && n < field.min) {
        return { ok: false, error: `${field.label} must be at least ${field.min}` };
      }
      if (field.max !== undefined && n > field.max) {
        return { ok: false, error: `${field.label} must be at most ${field.max}` };
      }
      return { ok: true, value: n };
    }

    case "decimal": {
      // Thousands separators are stripped; a decimal comma is normalized to a
      // point. Both are what Excel emits under a European locale.
      const normalized = text.replace(/\s/g, "").replace(/,(?=\d{3}\b)/g, "").replace(",", ".");
      if (!/^-?\d+(\.\d+)?$/.test(normalized)) {
        return { ok: false, error: `${field.label} must be a number` };
      }
      const n = Number.parseFloat(normalized);
      if (!Number.isFinite(n)) return { ok: false, error: `${field.label} must be a number` };
      if (field.min !== undefined && n < field.min) {
        return {
          ok: false,
          error: field.min === 0
            ? `${field.label} cannot be negative`
            : `${field.label} must be at least ${field.min}`,
        };
      }
      if (field.max !== undefined && n > field.max) {
        return { ok: false, error: `${field.label} must be at most ${field.max}` };
      }
      return { ok: true, value: n };
    }

    case "date": {
      const parsed = parseDate(text);
      if (!parsed) {
        return {
          ok: false,
          error: `${field.label} must be a date in YYYY-MM-DD, DD.MM.YYYY or YYYY/MM/DD format`,
        };
      }
      return { ok: true, value: parsed };
    }

    case "boolean": {
      const lower = text.toLowerCase();
      if (TRUE_VALUES.has(lower)) return { ok: true, value: true };
      if (FALSE_VALUES.has(lower)) return { ok: true, value: false };
      return { ok: false, error: `${field.label} must be yes or no` };
    }

    case "enum": {
      const upper = text.toUpperCase().replace(/[\s-]+/g, "_");
      if (!field.enumValues?.includes(upper)) {
        return {
          ok: false,
          error: `${field.label} must be one of: ${field.enumValues?.join(", ") ?? ""}`,
        };
      }
      return { ok: true, value: upper };
    }

    case "currency": {
      const upper = text.toUpperCase();
      if (!KNOWN_CURRENCIES.has(upper)) {
        return { ok: false, error: `${field.label} is not a recognised currency code (e.g. USD, EUR)` };
      }
      return { ok: true, value: upper };
    }

    case "reference":
      // Resolution needs a database and is therefore not a pure coercion — the
      // validator does it in a batched second pass (see validation.service.ts).
      // Here we only carry the raw text through.
      return { ok: true, value: text };

    default:
      return { ok: false, error: `${field.label} has an unsupported type` };
  }
}

/// Returns a UTC Date at midnight, or null. Exported for direct testing of the
/// ambiguity rules above.
export function parseDate(text: string): Date | null {
  let year: number, month: number, day: number;

  const iso = ISO_DATE.exec(text);
  const dmy = DMY_DATE.exec(text);
  const ymd = YMD_SLASH.exec(text);

  if (iso) {
    year = Number(iso[1]); month = Number(iso[2]); day = Number(iso[3]);
  } else if (dmy) {
    day = Number(dmy[1]); month = Number(dmy[2]); year = Number(dmy[3]);
  } else if (ymd) {
    year = Number(ymd[1]); month = Number(ymd[2]); day = Number(ymd[3]);
  } else {
    return null;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  // Catches overflow that Date silently rolls over: Feb 31 becomes Mar 3
  // rather than throwing, which would import a wrong date as if it were fine.
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}
