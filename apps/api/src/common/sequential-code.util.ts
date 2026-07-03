/// Shared "next sequential code" algorithm used by Customer.customerCode,
/// Driver.employeeCode, Vehicle.vehicleCode, and Order.orderNumber — all
/// unique-per-organization, auto-generated-with-manual-override codes. Each
/// model has its own thin wrapper (see e.g. driver-code.util.ts) that fetches
/// that model's existing codes and calls this; kept here once rather than
/// duplicated four times since the numeric-suffix-vs-lexicographic edge case
/// below is easy to get subtly wrong.

/// A code must be short, printable, and URL/CSV-safe. Applied both to
/// client-supplied codes and, defensively, to generated ones.
export function isValidEntityCode(code: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9-]{0,49}$/.test(code);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/// Given every existing code that starts with `prefix` for an organization,
/// returns the next "PREFIX0001"-style code — based on the highest existing
/// *numeric* suffix (not row count, not createdAt order, and NOT lexical
/// string order — "0002" would sort after "0010" as plain strings, but the
/// next code after both must be "0011", not "0003"). Falls back to scanning
/// forward on an exact collision (e.g. a record was manually given the
/// "next" code already).
export function nextSequentialCode(
  existingCodes: string[],
  prefix: string,
  padLength: number,
): string {
  const codeSet = new Set(existingCodes);
  const pattern = new RegExp(`^${escapeRegExp(prefix)}(\\d+)$`);

  const maxNumber = existingCodes.reduce((max, code) => {
    const match = pattern.exec(code);
    if (!match) return max;
    return Math.max(max, parseInt(match[1], 10));
  }, 0);

  let candidateNumber = maxNumber + 1;
  let candidate = `${prefix}${String(candidateNumber).padStart(padLength, "0")}`;
  while (codeSet.has(candidate)) {
    candidateNumber += 1;
    candidate = `${prefix}${String(candidateNumber).padStart(padLength, "0")}`;
  }

  return candidate;
}
