/// Block-level: the one component every other content-level piece (EmailCard,
/// EmailTitle, EmailText, EmailButton, ...) gets wrapped in before it can sit
/// directly inside EmailLayout's outer table — returns exactly one <tr> with
/// consistent horizontal/vertical padding, so no template hand-rolls its own
/// spacing values.
export function EmailSection(options: {
  children: string;
  paddingTop?: number;
  paddingBottom?: number;
  paddingX?: number;
}): string {
  const { children, paddingTop = 4, paddingBottom = 20, paddingX = 24 } = options;
  return `
  <tr>
    <td style="padding:${paddingTop}px ${paddingX}px ${paddingBottom}px;">
      ${children}
    </td>
  </tr>`;
}
