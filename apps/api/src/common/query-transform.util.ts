/// Normalizes empty query-string values to `undefined` for optional DTO fields.
export function emptyToUndefined({ value }: { value: unknown }): unknown {
  return value === "" || value == null ? undefined : value;
}
