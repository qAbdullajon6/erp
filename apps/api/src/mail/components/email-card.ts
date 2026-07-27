import { emailTheme } from "./theme";

/// Content-level: a white, rounded, bordered container — the "white card"
/// look the brief asks for. box-shadow is progressive enhancement (Outlook
/// ignores it silently; every other client renders the subtle elevation);
/// the 1px border is the fallback that keeps the card visibly separated from
/// the page background even where the shadow doesn't render.
export function EmailCard(options: { children: string }): string {
  const { colors } = emailTheme;
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${colors.cardBackground};border:1px solid ${colors.border};border-radius:12px;box-shadow:0 1px 3px rgba(16,24,40,0.06),0 1px 2px rgba(16,24,40,0.04);">
    <tr>
      <td style="padding:28px 28px;">
        ${options.children}
      </td>
    </tr>
  </table>`;
}
