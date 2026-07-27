import type { CustomerPortalInvitationEmailMessage, RenderedEmail } from "../mail.service";
import type { EmailBrandingContext } from "../components/theme";
import { escapeHtml } from "../components/html-utils";
import { EmailLayout } from "../components/email-layout";
import { EmailHeader } from "../components/email-header";
import { EmailFooter } from "../components/email-footer";
import { EmailSection } from "../components/email-section";
import { EmailTitle } from "../components/email-title";
import { EmailText, EmailMutedText } from "../components/email-text";
import { EmailButton } from "../components/email-button";

/// Builds the plaintext + HTML bodies for a customer-portal invitation email.
/// Contains the organization name, the optional inviter name, the activation
/// link, and the expiry. Carries no token beyond the already-built accept URL.
///
/// Wording and subject are unchanged from before this file moved into
/// ./templates and switched to the shared component system.
export function renderCustomerPortalInvitationEmail(
  message: CustomerPortalInvitationEmailMessage,
  branding: EmailBrandingContext,
): RenderedEmail {
  const { organizationName, customerCompanyName, invitedByName, acceptUrl, expiresAt } = message;

  const intro = invitedByName
    ? `${invitedByName} has invited ${customerCompanyName} to access the ${organizationName} customer portal, where you can track orders, invoices, and deliveries.`
    : `${organizationName} has invited ${customerCompanyName} to access their customer portal, where you can track orders, invoices, and deliveries.`;
  const expiry = expiresAt.toUTCString();

  const subject = `You're invited to the ${organizationName} customer portal`;

  const text = [
    intro,
    "",
    `Activate your account: ${acceptUrl}`,
    "",
    `This invitation expires on ${expiry}.`,
    "If you were not expecting this, you can safely ignore this email.",
  ].join("\n");

  const bodyHtml = [
    EmailHeader({ branding }),
    EmailSection({
      children: [
        EmailTitle({ children: "You're invited to the customer portal" }),
        EmailText({ children: escapeHtml(intro) }),
      ].join(""),
    }),
    EmailSection({
      paddingTop: 8,
      children: `<div style="text-align:center;">${EmailButton({ label: "Activate your account", url: acceptUrl })}</div>`,
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
