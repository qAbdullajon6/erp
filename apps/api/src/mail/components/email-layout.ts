import { emailTheme } from "./theme";
import { escapeHtml } from "./html-utils";

/// The root document. Every other component composes inside this — see the
/// per-file comments for the "block-level" (<tr>-returning) vs
/// "content-level" (plain HTML, placed inside a block-level component's
/// <td>) convention every component in this directory follows.
///
/// Layout is table-based throughout (not flexbox/grid — Outlook's Word
/// rendering engine supports neither), max-width 600px, and every table
/// carries `role="presentation"` so screen readers treat these as pure
/// layout, not tabular data.
///
/// Outlook/Gmail-specific safety included here:
///  - `<!--[if mso]>` MSO PixelsPerInch fix — without it Outlook can scale
///    images/fonts at 120 DPI instead of 96, distorting the whole layout.
///  - `color-scheme`/`supported-color-schemes` meta — this is a deliberately
///    light-themed template (white cards, dark text); without these, Gmail
///    and Apple Mail's automatic dark-mode inversion can flip the carefully
///    chosen contrast pairs into unreadable ones.
///  - A hidden preheader span carries the inbox preview snippet so it shows
///    the intended one-line summary instead of "View this email in your
///    browser" or raw HTML.
export function EmailLayout(options: { title: string; previewText?: string; children: string }): string {
  const { title, previewText, children } = options;
  const { colors, fontFamily, layout } = emailTheme;

  return `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(title)}</title>
<!--[if mso]>
<noscript>
<xml>
<o:OfficeDocumentSettings>
<o:PixelsPerInch>96</o:PixelsPerInch>
</o:OfficeDocumentSettings>
</xml>
</noscript>
<style>
  table { border-collapse: collapse; }
</style>
<![endif]-->
<style>
  body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  img { -ms-interpolation-mode: bicubic; }
  a { color: inherit; }
  @media only screen and (max-width: 600px) {
    .email-container { width: 100% !important; max-width: 100% !important; }
    .email-stack-padding { padding-left: 20px !important; padding-right: 20px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:${colors.pageBackground};font-family:${fontFamily};">
  ${
    previewText
      ? `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escapeHtml(previewText)}</div>`
      : ""
  }
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${colors.pageBackground};">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="${layout.maxWidth}" cellpadding="0" cellspacing="0" border="0" class="email-container" style="width:${layout.maxWidth}px;max-width:${layout.maxWidth}px;">
          ${children}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
