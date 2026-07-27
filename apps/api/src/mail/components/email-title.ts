import { emailTheme } from "./theme";

/// Content-level (no <tr> — place inside an EmailSection). Renders a real
/// heading tag: `large` -> <h1> (one per email, the page title) and `small`
/// -> <h2> (subsection headings like "What happens next?"), so the email
/// keeps a genuine heading hierarchy for screen readers instead of styled
/// <span>s that only look like headings.
///
/// `children` must already be safe HTML (escaped by the caller) — this
/// component does not escape, matching every other component in this
/// directory.
export function EmailTitle(options: { children: string; size?: "large" | "small" }): string {
  const { children, size = "large" } = options;
  const { colors, fontFamily } = emailTheme;
  const tag = size === "large" ? "h1" : "h2";
  const fontSize = size === "large" ? "24px" : "17px";

  return `<${tag} style="margin:0 0 12px;font-family:${fontFamily};font-size:${fontSize};line-height:1.35;font-weight:700;color:${colors.heading};">${children}</${tag}>`;
}
