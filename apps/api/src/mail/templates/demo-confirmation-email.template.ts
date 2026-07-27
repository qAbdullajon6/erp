import type { DemoConfirmationEmailMessage, RenderedEmail } from "../mail.service";
import { emailTheme, type EmailBrandingContext } from "../components/theme";
import { escapeHtml } from "../components/html-utils";
import { EmailLayout } from "../components/email-layout";
import { EmailHeader } from "../components/email-header";
import { EmailFooter } from "../components/email-footer";
import { EmailSection } from "../components/email-section";
import { EmailTitle } from "../components/email-title";
import { EmailText } from "../components/email-text";
import { EmailCard } from "../components/email-card";
import { EmailInfoRow } from "../components/email-info-row";
import { EmailDivider } from "../components/email-divider";
import { EmailButton } from "../components/email-button";

const NEXT_STEPS = [
  "A FlowERP specialist reviews your request.",
  "We'll contact you.",
  "We'll prepare a personalized demo.",
] as const;

/// A single "1  A FlowERP specialist reviews your request." row: a numbered
/// circle badge beside the step text. Local to this template rather than a
/// named export in ../components — the shared component list covers the
/// general-purpose pieces; this is one bespoke composition of them specific
/// to a "what happens next" list, built from EmailText's same tokens.
function numberedStep(number: number, text: string): string {
  const { colors, fontFamily } = emailTheme;
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 14px;">
    <tr>
      <td width="30" valign="top">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="26" height="26" style="background-color:${colors.brandSoft};border-radius:50%;">
          <tr>
            <td align="center" valign="middle" style="width:26px;height:26px;font-family:${fontFamily};font-size:12px;font-weight:700;color:${colors.brandDark};">${number}</td>
          </tr>
        </table>
      </td>
      <td valign="top" style="padding-left:12px;padding-top:3px;font-family:${fontFamily};font-size:14px;line-height:1.6;color:${colors.body};">${escapeHtml(text)}</td>
    </tr>
  </table>`;
}

/// Renders the customer-facing confirmation email — sent to the address the
/// visitor themselves typed into the public demo form, immediately after a
/// successful submission. Warm, brief, no marketing copy: it exists to
/// confirm receipt and set an honest expectation ("one business day"), not
/// to sell.
export function renderDemoConfirmationEmail(
  message: DemoConfirmationEmailMessage,
  branding: EmailBrandingContext,
): RenderedEmail {
  const { to, name, company, phone } = message;
  const firstName = name.trim().split(/\s+/)[0] || name;
  const subject = "We've received your demo request";

  // ---- HTML ----

  const infoCard = EmailCard({
    children: [
      EmailInfoRow({ label: "Name", value: escapeHtml(name) }),
      EmailInfoRow({ label: "Company", value: escapeHtml(company) }),
      EmailInfoRow({ label: "Email", value: escapeHtml(to) }),
      EmailInfoRow({ label: "Phone", value: escapeHtml(phone) }),
    ].join(""),
  });

  const stepsHtml = NEXT_STEPS.map((step, i) => numberedStep(i + 1, step)).join("");

  const bodyHtml = [
    EmailHeader({ branding }),
    EmailSection({
      children: [
        EmailTitle({ children: `Thank you, ${escapeHtml(firstName)}!` }),
        EmailText({ children: "We've received your request." }),
        EmailText({ children: "Our team usually responds within one business day." }),
      ].join(""),
    }),
    EmailSection({ children: infoCard }),
    EmailSection({
      children: [EmailTitle({ children: "What happens next?", size: "small" }), stepsHtml].join(""),
    }),
    EmailSection({
      children: [
        EmailDivider(),
        EmailText({ children: "Explore FlowERP while you wait." }),
        `<div style="text-align:center;padding-top:4px;">${EmailButton({ label: "Visit FlowERP", url: branding.marketingUrl })}</div>`,
      ].join(""),
    }),
    EmailFooter({ branding, tagline: "Questions? Reply directly to this email." }),
  ].join("");

  const html = EmailLayout({
    title: subject,
    previewText: `Thanks ${firstName} — we'll be in touch within one business day.`,
    children: bodyHtml,
  });

  // ---- Plaintext ----

  const text = [
    `Thank you, ${firstName}!`,
    "",
    "We've received your request.",
    "Our team usually responds within one business day.",
    "",
    "Your submission:",
    `Name:    ${name}`,
    `Company: ${company}`,
    `Email:   ${to}`,
    `Phone:   ${phone}`,
    "",
    "What happens next?",
    ...NEXT_STEPS.map((step, i) => `${i + 1}. ${step}`),
    "",
    `Explore FlowERP: ${branding.marketingUrl}`,
    "",
    "Questions? Reply directly to this email.",
  ].join("\n");

  return { subject, text, html };
}
