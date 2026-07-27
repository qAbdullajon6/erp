import { emailTheme, type EmailBrandingContext } from "./theme";
import { EmailLogo } from "./email-logo";

/// Block-level: returns one <tr> for EmailLayout's outer table. The brand
/// lockup (mark + wordmark) sits on the page background, above the white
/// card — the same composition Stripe/Linear/Notion use, so the logo reads
/// clearly even before the card "starts."
export function EmailHeader(options: { branding: EmailBrandingContext }): string {
  const { branding } = options;
  const { colors, fontFamily } = emailTheme;

  return `
  <tr>
    <td align="center" style="padding:36px 24px 28px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td valign="middle" style="padding-right:10px;">
            ${EmailLogo({ logoUrl: branding.logoUrl, size: 40 })}
          </td>
          <td valign="middle">
            <span style="font-family:${fontFamily};font-size:20px;font-weight:700;color:${colors.heading};letter-spacing:-0.01em;">Flow<span style="color:${colors.brandDark};">ERP</span></span>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}
