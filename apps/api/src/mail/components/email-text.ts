import { emailTheme } from "./theme";

/// Content-level paragraph. `children` must already be safe HTML.
export function EmailText(options: { children: string }): string {
  const { colors, fontFamily } = emailTheme;
  return `<p style="margin:0 0 16px;font-family:${fontFamily};font-size:15px;line-height:1.65;color:${colors.body};">${options.children}</p>`;
}

/// Content-level paragraph, smaller and lower-contrast — captions,
/// timestamps, disclaimers. Still >= 4.5:1 against white (AA).
export function EmailMutedText(options: { children: string }): string {
  const { colors, fontFamily } = emailTheme;
  return `<p style="margin:0 0 8px;font-family:${fontFamily};font-size:13px;line-height:1.6;color:${colors.muted};">${options.children}</p>`;
}
