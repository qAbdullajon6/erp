import { emailTheme } from "./theme";

/// Content-level. The "bulletproof button" table pattern: a table cell with
/// an HTML `bgcolor` attribute (which Outlook's Word rendering engine honors
/// even where it ignores CSS background-color) plus progressive CSS
/// (border-radius, hover-friendly padding). Outlook desktop renders square
/// corners instead of rounded — the only degradation, and the button stays
/// fully visible and clickable there either way.
///
/// Solid #0073CF background with white text: 4.82:1 contrast, passes WCAG AA.
/// Real padding (14px/28px) keeps the tap target comfortably above the
/// ~44x44px mobile accessibility guideline.
export function EmailButton(options: { label: string; url: string }): string {
  const { label, url } = options;
  const { colors, fontFamily } = emailTheme;

  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
    <tr>
      <td align="center" bgcolor="${colors.brandDark}" style="border-radius:8px;">
        <a href="${url}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 30px;font-family:${fontFamily};font-size:15px;font-weight:600;color:${colors.white};text-decoration:none;border-radius:8px;">${label}</a>
      </td>
    </tr>
  </table>`;
}
