import { MailService } from "./mail.service";
import { MailOutbox } from "./mail.outbox";
import { OutboxMailService } from "./providers/outbox-mail.service";
import { SmtpMailService } from "./providers/smtp-mail.service";
import { UnavailableMailService } from "./providers/unavailable-mail.service";
import { DEFAULT_EMAIL_BRANDING } from "./components/theme";

export interface MailServiceSelection {
  nodeEnv: string;
  smtpUrl?: string;
  mailFrom?: string;
  smtpConnectHost?: string;
  /// Public marketing-site URL, for email branding (logo, footer/CTA links).
  /// Optional here — defaults to the real production domain — so existing
  /// callers (and this file's own test suite) that don't pass one still
  /// compile and behave correctly rather than needing a fabricated value.
  marketingUrl?: string;
  /// The shared outbox instance the dev/test provider records into. Passed in
  /// so DI and tests use the same instance.
  outbox: MailOutbox;
}

function isValidMailbox(value: string): boolean {
  if (value.includes("\r") || value.includes("\n")) return false;

  const match = value.match(/^(?:[^<>"]+|"[^"]*")?\s*<([^<>\s]+)>$/);
  const address = (match?.[1] ?? value).trim();
  if (!address || address.length > 254 || address.split("@").length !== 2) return false;

  const [local, domain] = address.split("@");
  if (
    !local ||
    local.length > 64 ||
    !/^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(local) ||
    local.startsWith(".") ||
    local.endsWith(".") ||
    local.includes("..")
  ) {
    return false;
  }

  const labels = domain.split(".");
  return (
    domain.length <= 253 &&
    labels.length >= 2 &&
    labels.every(
      (label) =>
        label.length > 0 &&
        label.length <= 63 &&
        /^[A-Z0-9-]+$/i.test(label) &&
        !label.startsWith("-") &&
        !label.endsWith("-"),
    )
  );
}

function requireValidMailFrom(mailFrom: string | undefined): string {
  const value = mailFrom?.trim();
  if (!value || !isValidMailbox(value)) {
    throw new Error("Invalid mail configuration");
  }
  return value;
}

/// Picks the concrete MailService. Extracted from the module as a pure function
/// so provider selection — including the production no-SMTP safety rule — is
/// unit-testable without booting Nest or touching the network:
///
///   - test environment           -> OutboxMailService   (never real delivery)
///   - SMTP_URL configured        -> SmtpMailService     (real delivery)
///   - non-production, no SMTP     -> OutboxMailService   (dev/test capture)
///   - production, no SMTP         -> UnavailableMailService (fails clearly)
///
/// The dev/test outbox is never returned for production, so it can never become
/// a silent production fallback.
export function createMailService(selection: MailServiceSelection): MailService {
  const marketingUrl = selection.marketingUrl ?? DEFAULT_EMAIL_BRANDING.marketingUrl;
  // Tests may load a developer's .env. Never let that turn an e2e suite into
  // real email delivery or leak reset/invitation capabilities to SMTP.
  if (selection.nodeEnv === "test") {
    return new OutboxMailService(selection.outbox);
  }
  if (selection.smtpUrl) {
    return new SmtpMailService(
      selection.smtpUrl,
      requireValidMailFrom(selection.mailFrom),
      marketingUrl,
      selection.smtpConnectHost,
    );
  }
  if (selection.nodeEnv !== "production") {
    return new OutboxMailService(selection.outbox);
  }
  return new UnavailableMailService();
}
