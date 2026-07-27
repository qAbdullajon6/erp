/// Barrel for the email design system. Two kinds of component live here:
///
///  - Block-level (EmailLayout, EmailHeader, EmailSection, EmailFooter):
///    each returns exactly one <tr>...</tr>, meant to sit directly inside
///    EmailLayout's outer table.
///  - Content-level (everything else: EmailCard, EmailTitle, EmailText,
///    EmailMutedText, EmailButton, EmailInfoRow, EmailDivider,
///    EmailSocialLinks, EmailSignature, EmailLogo): plain HTML strings,
///    composed together and placed inside a block-level component's <td>
///    (almost always via EmailSection).
///
/// A template never hand-writes a <table>/<tr>/<td> itself — every visual
/// piece it needs already exists here. Adding a new template means writing a
/// render*Email() function in ../templates that only calls these.
export * from "./theme";
export * from "./html-utils";
export * from "./email-layout";
export * from "./email-header";
export * from "./email-footer";
export * from "./email-section";
export * from "./email-card";
export * from "./email-title";
export * from "./email-text";
export * from "./email-button";
export * from "./email-info-row";
export * from "./email-divider";
export * from "./email-logo";
export * from "./email-social-links";
export * from "./email-signature";
