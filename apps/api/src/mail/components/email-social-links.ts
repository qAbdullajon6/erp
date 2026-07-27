import { emailTheme } from "./theme";

export interface EmailSocialLink {
  label: string;
  url: string;
}

/// Content-level. Renders nothing at all when no links are supplied — never
/// invents a placeholder icon or a guessed URL. Plain text links rather than
/// icon images: an icon set would be another set of hosted assets this
/// codebase doesn't have, and blocked-by-default remote images would leave
/// unlabeled blank icons for anyone who hasn't clicked "show images."
export function EmailSocialLinks(options: { links?: EmailSocialLink[] }): string {
  const { links } = options;
  if (!links || links.length === 0) return "";

  const { colors, fontFamily } = emailTheme;
  const items = links
    .map(
      (link) =>
        `<a href="${link.url}" style="color:${colors.brandDark};text-decoration:none;font-family:${fontFamily};font-size:12px;font-weight:600;">${link.label}</a>`,
    )
    .join(`<span style="color:${colors.border};padding:0 8px;">·</span>`);

  return `<p style="margin:0 0 12px;">${items}</p>`;
}
