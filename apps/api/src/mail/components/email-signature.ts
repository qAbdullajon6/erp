import { emailTheme } from "./theme";

/// Content-level sign-off line (e.g. "— The FlowERP Team"). `children` must
/// already be safe HTML.
export function EmailSignature(options: { children: string }): string {
  const { colors, fontFamily } = emailTheme;
  return `<p style="margin:20px 0 0;font-family:${fontFamily};font-size:14px;line-height:1.6;color:${colors.body};font-style:italic;">${options.children}</p>`;
}
