import type { LeadNotificationEmailMessage, RenderedEmail } from "../mail.service";
import type { EmailBrandingContext } from "../components/theme";
import { escapeHtml, escapeHtmlMultiline, formatEmailDate } from "../components/html-utils";
import { EmailLayout } from "../components/email-layout";
import { EmailHeader } from "../components/email-header";
import { EmailFooter } from "../components/email-footer";
import { EmailSection } from "../components/email-section";
import { EmailTitle } from "../components/email-title";
import { EmailText } from "../components/email-text";
import { EmailCard } from "../components/email-card";
import { EmailInfoRow } from "../components/email-info-row";
import { EmailButton } from "../components/email-button";
import { emailTheme } from "../components/theme";

/// Attribution/UTM fields in display order. Shared between the HTML and
/// plaintext builders below so the two can never drift out of sync on which
/// fields exist or what order they render in.
function attributionEntries(message: LeadNotificationEmailMessage): Array<[string, string]> {
  return (
    [
      ["Lead Source", message.source],
      ["Landing Page", message.landingPath],
      ["Referrer", message.referrer],
      ["UTM Source", message.utmSource],
      ["UTM Medium", message.utmMedium],
      ["UTM Campaign", message.utmCampaign],
      ["UTM Term", message.utmTerm],
      ["UTM Content", message.utmContent],
    ] as Array<[string, string | undefined]>
  ).filter((entry): entry is [string, string] => Boolean(entry[1]));
}

/// Renders the admin-facing "new demo request" notification — the email an
/// internal FlowERP staff address (LEADS_NOTIFY_EMAIL) receives every time
/// the public marketing form is submitted.
export function renderLeadNotificationEmail(
  message: LeadNotificationEmailMessage,
  branding: EmailBrandingContext,
): RenderedEmail {
  const { name, email, company, phone, message: leadMessage, submittedAt, dashboardUrl } = message;
  const submittedAtDisplay = formatEmailDate(submittedAt);
  const attribution = attributionEntries(message);

  const subject = `🚀 New Demo Request — ${company}`;

  // ---- HTML ----

  const contactRows = [
    EmailInfoRow({ label: "Name", value: escapeHtml(name) }),
    EmailInfoRow({ label: "Company", value: escapeHtml(company) }),
    EmailInfoRow({
      label: "Email",
      value: `<a href="mailto:${escapeHtml(email)}" style="color:${emailTheme.colors.brandDark};text-decoration:none;">${escapeHtml(email)}</a>`,
    }),
    EmailInfoRow({
      label: "Phone",
      value: `<a href="tel:${escapeHtml(phone)}" style="color:${emailTheme.colors.brandDark};text-decoration:none;">${escapeHtml(phone)}</a>`,
    }),
  ].join("");

  const messageRow = leadMessage
    ? EmailInfoRow({ label: "Message", value: escapeHtmlMultiline(leadMessage) })
    : "";

  const attributionRows = attribution
    .map(([label, value]) => EmailInfoRow({ label, value: escapeHtml(value) }))
    .join("");

  const submittedRow = EmailInfoRow({ label: "Submitted", value: escapeHtml(submittedAtDisplay) });

  const cardContent = [contactRows, messageRow, attributionRows, submittedRow].join("");

  const ctaSection = dashboardUrl
    ? EmailSection({
        paddingTop: 4,
        children: `<div style="text-align:center;">${EmailButton({ label: "Open Lead Dashboard", url: dashboardUrl })}</div>`,
      })
    : "";

  const bodyHtml = [
    EmailHeader({ branding }),
    EmailSection({
      children: [
        EmailTitle({ children: "New Demo Request" }),
        EmailText({ children: `A new demo request just came in from <strong>${escapeHtml(company)}</strong>.` }),
      ].join(""),
    }),
    EmailSection({ children: EmailCard({ children: cardContent }) }),
    ctaSection,
    EmailFooter({ branding, tagline: "FlowERP Operations Platform" }),
  ].join("");

  const html = EmailLayout({
    title: subject,
    previewText: `${name} from ${company} just requested a demo.`,
    children: bodyHtml,
  });

  // ---- Plaintext ----

  const textLines = [
    "New Demo Request",
    "",
    `Name:     ${name}`,
    `Company:  ${company}`,
    `Email:    ${email}`,
    `Phone:    ${phone}`,
  ];
  if (leadMessage) textLines.push("", "Message:", leadMessage);
  if (attribution.length > 0) {
    textLines.push("", "Attribution:", ...attribution.map(([label, value]) => `${label}: ${value}`));
  }
  textLines.push("", `Submitted: ${submittedAtDisplay}`);
  if (dashboardUrl) textLines.push("", `Open Lead Dashboard: ${dashboardUrl}`);
  textLines.push("", "FlowERP Operations Platform");

  return { subject, text: textLines.join("\n"), html };
}
