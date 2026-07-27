import type { InvitationEmailMessage, RenderedEmail } from "../mail.service";
import type { EmailBrandingContext } from "../components/theme";
import { escapeHtml } from "../components/html-utils";
import { EmailLayout } from "../components/email-layout";
import { EmailHeader } from "../components/email-header";
import { EmailFooter } from "../components/email-footer";
import { EmailSection } from "../components/email-section";
import { EmailTitle } from "../components/email-title";
import { EmailText } from "../components/email-text";
import { EmailButton } from "../components/email-button";
import { EmailMutedText } from "../components/email-text";

/// Builds the plaintext + HTML bodies for an invitation email. Contains the
/// organization name, the optional inviter name, the accept link, and the
/// expiry. Carries no token beyond the already-built accept URL.
///
/// Wording and subject are unchanged from before this file moved into
/// ./templates and switched to the shared component system — only the visual
/// presentation changed, not the content a recipient reads.
export function renderInvitationEmail(
  message: InvitationEmailMessage,
  branding: EmailBrandingContext,
): RenderedEmail {
  const { organizationName, inviterName, acceptUrl, expiresAt } = message;

  const intro = inviterName
    ? `${inviterName} has invited you to join ${organizationName} on FlowERP.`
    : `You have been invited to join ${organizationName} on FlowERP.`;
  const expiry = expiresAt.toUTCString();

  const subject = `You're invited to join ${organizationName} on FlowERP`;

  const text = [
    intro,
    "",
    `Accept your invitation: ${acceptUrl}`,
    "",
    `This invitation expires on ${expiry}.`,
    "If you were not expecting this, you can safely ignore this email.",
  ].join("\n");

  const bodyHtml = [
    EmailHeader({ branding }),
    EmailSection({
      children: [
        EmailTitle({ children: "You're invited" }),
        EmailText({ children: escapeHtml(intro) }),
      ].join(""),
    }),
    EmailSection({
      paddingTop: 8,
      children: `<div style="text-align:center;">${EmailButton({ label: "Accept your invitation", url: acceptUrl })}</div>`,
    }),
    EmailSection({
      paddingTop: 8,
      children: [
        EmailMutedText({ children: `This invitation expires on ${escapeHtml(expiry)}.` }),
        EmailMutedText({ children: "If you were not expecting this, you can safely ignore this email." }),
      ].join(""),
    }),
    EmailFooter({ branding }),
  ].join("");

  const html = EmailLayout({
    title: subject,
    previewText: intro,
    children: bodyHtml,
  });

  return { subject, text, html };
}
