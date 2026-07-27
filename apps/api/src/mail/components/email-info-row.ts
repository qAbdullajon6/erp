import { emailTheme } from "./theme";

/// Content-level: one "Label" / value block, stacked vertically (label above
/// value) rather than side-by-side. Side-by-side two-column rows look tidy
/// on desktop but break on narrow phone screens once a value is long (a full
/// email address, a multi-line message) — stacking is the layout that never
/// overflows, which is why every SaaS receipt/notification email (Stripe,
/// GitHub) uses it instead of a literal table.
///
/// `value` must already be safe HTML (escaped by the caller) — this
/// component does not escape, and deliberately allows callers to pass
/// pre-built markup (e.g. a `mailto:`/`tel:` link) as the value.
export function EmailInfoRow(options: { label: string; value: string }): string {
  const { label, value } = options;
  const { colors, fontFamily } = emailTheme;

  return `
  <div style="margin:0 0 16px;">
    <p style="margin:0 0 3px;font-family:${fontFamily};font-size:11px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:${colors.muted};">${label}</p>
    <p style="margin:0;font-family:${fontFamily};font-size:15px;line-height:1.5;color:${colors.heading};word-break:break-word;">${value}</p>
  </div>`;
}
