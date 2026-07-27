import { emailTheme, emailBrand, type EmailBrandingContext } from "./theme";
import { escapeHtml, displayUrl } from "./html-utils";
import { EmailSocialLinks, type EmailSocialLink } from "./email-social-links";

/// Block-level: returns one <tr>. The one footer every email shares —
/// optional tagline, copyright with the current year computed live (never
/// hardcoded, so it can't go stale), a link to the real marketing site, and
/// social links only when the caller actually has some to pass (see
/// EmailSocialLinks — never invents any).
export function EmailFooter(options: {
  branding: EmailBrandingContext;
  tagline?: string;
  socialLinks?: EmailSocialLink[];
}): string {
  const { branding, tagline, socialLinks } = options;
  const { colors, fontFamily } = emailTheme;
  const year = new Date().getFullYear();

  return `
  <tr>
    <td align="center" style="padding:28px 24px 40px;">
      ${EmailSocialLinks({ links: socialLinks })}
      ${
        tagline
          ? `<p style="margin:0 0 8px;font-family:${fontFamily};font-size:12px;color:${colors.muted};">${escapeHtml(tagline)}</p>`
          : ""
      }
      <p style="margin:0 0 4px;font-family:${fontFamily};font-size:12px;color:${colors.muted};">&copy; ${year} ${emailBrand.legalName}. All rights reserved.</p>
      <p style="margin:0;font-family:${fontFamily};font-size:12px;">
        <a href="${branding.marketingUrl}" style="color:${colors.brandDark};text-decoration:underline;">${displayUrl(branding.marketingUrl)}</a>
      </p>
    </td>
  </tr>`;
}
