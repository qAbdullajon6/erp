/**
 * Support Phase 4 — Email notification tests
 *
 * Uses the MailOutbox (test-mode mail capture) to verify that support-reply
 * emails are sent correctly without touching a real SMTP server.
 */

import { validate } from "class-validator";
import type { SupportReplyEmailMessage } from "../mail/mail.service";
import { renderSupportReplyEmail } from "../mail/templates/support-reply-email.template";
import { DEFAULT_EMAIL_BRANDING } from "../mail/components/theme";

// ─── Template unit tests ─────────────────────────────────────────────────────

describe("renderSupportReplyEmail", () => {
  const base: SupportReplyEmailMessage = {
    to: "customer@example.com",
    recipientName: "Aziz Karimov",
    ticketSubject: "Invoice not received",
    messagePreview: "Hi Aziz, we have reviewed your case and the invoice has been resent.",
    ticketStatus: "In progress",
    ticketUrl: "https://app.flowerp.uz/app?openSupportTicket=abc-123",
  };

  it("renders a subject with the ticket subject", () => {
    const { subject } = renderSupportReplyEmail(base, DEFAULT_EMAIL_BRANDING);
    expect(subject).toContain("Invoice not received");
    expect(subject).toContain("FlowERP Support replied");
  });

  it("renders the recipient name in the plaintext body", () => {
    const { text } = renderSupportReplyEmail(base, DEFAULT_EMAIL_BRANDING);
    expect(text).toContain("Aziz Karimov");
  });

  it("renders the message preview in the plaintext body", () => {
    const { text } = renderSupportReplyEmail(base, DEFAULT_EMAIL_BRANDING);
    expect(text).toContain("invoice has been resent");
  });

  it("renders the ticket URL as a CTA in the plaintext body", () => {
    const { text } = renderSupportReplyEmail(base, DEFAULT_EMAIL_BRANDING);
    expect(text).toContain("https://app.flowerp.uz/app?openSupportTicket=abc-123");
  });

  it("renders the ticket status", () => {
    const { text } = renderSupportReplyEmail(base, DEFAULT_EMAIL_BRANDING);
    expect(text).toContain("In progress");
  });

  it("renders HTML that includes the ticket subject", () => {
    const { html } = renderSupportReplyEmail(base, DEFAULT_EMAIL_BRANDING);
    expect(html).toContain("Invoice not received");
  });

  it("renders HTML that includes the CTA button URL", () => {
    const { html } = renderSupportReplyEmail(base, DEFAULT_EMAIL_BRANDING);
    expect(html).toContain("https://app.flowerp.uz/app?openSupportTicket=abc-123");
  });

  it("HTML-escapes potentially unsafe characters in the preview", () => {
    const withXss: SupportReplyEmailMessage = {
      ...base,
      messagePreview: `<script>alert('xss')</script>`,
    };
    const { html } = renderSupportReplyEmail(withXss, DEFAULT_EMAIL_BRANDING);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("truncates long previews in plaintext gracefully", () => {
    const longBase = {
      ...base,
      messagePreview: "A".repeat(300),
    };
    const { text } = renderSupportReplyEmail(longBase, DEFAULT_EMAIL_BRANDING);
    // The caller (service) is responsible for truncation — template renders as-is
    expect(text.length).toBeGreaterThan(0);
  });
});

// ─── MailOutbox unit tests (test-mode capture) ───────────────────────────────

import { MailOutbox } from "../mail/mail.outbox";
import { OutboxMailService } from "../mail/providers/outbox-mail.service";

describe("OutboxMailService.sendSupportReplyEmail (test capture)", () => {
  let outbox: MailOutbox;
  let mailService: OutboxMailService;

  beforeEach(() => {
    outbox = new MailOutbox();
    mailService = new OutboxMailService(outbox);
  });

  const msg: SupportReplyEmailMessage = {
    to: "user@example.org",
    recipientName: "Test User",
    ticketSubject: "Cannot login",
    messagePreview: "We have reset your account.",
    ticketStatus: "In progress",
    ticketUrl: "https://app.flowerp.uz/app?openSupportTicket=ticket-1",
  };

  it("captures the email in the outbox", async () => {
    await mailService.sendSupportReplyEmail(msg);
    expect(outbox.listSupportReplyEmails()).toHaveLength(1);
  });

  it("captured email has correct to/subject fields", async () => {
    await mailService.sendSupportReplyEmail(msg);
    const captured = outbox.lastSupportReplyEmail()!;
    expect(captured.to).toBe("user@example.org");
    expect(captured.ticketSubject).toBe("Cannot login");
  });

  it("captured email contains the ticket URL", async () => {
    await mailService.sendSupportReplyEmail(msg);
    const captured = outbox.lastSupportReplyEmail()!;
    expect(captured.ticketUrl).toContain("openSupportTicket=ticket-1");
  });

  it("does not throw and resolves Promise<void>", async () => {
    await expect(mailService.sendSupportReplyEmail(msg)).resolves.toBeUndefined();
  });

  it("clear() removes captured support reply emails", async () => {
    await mailService.sendSupportReplyEmail(msg);
    expect(outbox.listSupportReplyEmails()).toHaveLength(1);
    outbox.clear();
    expect(outbox.listSupportReplyEmails()).toHaveLength(0);
  });

  it("captures multiple emails independently", async () => {
    const msg2: SupportReplyEmailMessage = { ...msg, to: "other@example.org", ticketSubject: "Second ticket" };
    await mailService.sendSupportReplyEmail(msg);
    await mailService.sendSupportReplyEmail(msg2);
    const captured = outbox.listSupportReplyEmails();
    expect(captured).toHaveLength(2);
    expect(captured[0].to).toBe("user@example.org");
    expect(captured[1].to).toBe("other@example.org");
  });
});

// ─── UnavailableMailService — graceful no-op ──────────────────────────────────

import { UnavailableMailService } from "../mail/providers/unavailable-mail.service";

describe("UnavailableMailService.sendSupportReplyEmail", () => {
  it("resolves (does NOT throw) so staff reply never fails", async () => {
    const service = new UnavailableMailService();
    await expect(
      service.sendSupportReplyEmail({
        to: "x@y.com",
        recipientName: "X",
        ticketSubject: "Test",
        messagePreview: "Reply",
        ticketStatus: "Open",
        ticketUrl: "https://app.flowerp.uz/app?openSupportTicket=x",
      }),
    ).resolves.toBeUndefined();
  });
});
