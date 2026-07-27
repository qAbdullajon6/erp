import { emailTheme } from "./theme";

/// Content-level. A 1px rule built from a styled <div>, not <hr> — <hr>
/// picks up inconsistent default styling across clients, while a fixed-height
/// div with a background color renders identically everywhere. `&nbsp;`
/// keeps the (otherwise empty) div from being collapsed to zero height by
/// clients that strip empty elements.
export function EmailDivider(): string {
  return `<div style="height:1px;line-height:1px;font-size:1px;background-color:${emailTheme.colors.border};margin:20px 0;">&nbsp;</div>`;
}
