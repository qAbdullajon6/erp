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
  /// Public marketing-site URL, for email branding (logo, footer/CTA links).
  /// Optional here — defaults to the real production domain — so existing
  /// callers (and this file's own test suite) that don't pass one still
  /// compile and behave correctly rather than needing a fabricated value.
  marketingUrl?: string;
  /// The shared outbox instance the dev/test provider records into. Passed in
  /// so DI and tests use the same instance.
  outbox: MailOutbox;
}

/// Picks the concrete MailService. Extracted from the module as a pure function
/// so provider selection — including the production no-SMTP safety rule — is
/// unit-testable without booting Nest or touching the network:
///
///   - SMTP_URL configured        -> SmtpMailService     (real delivery)
///   - non-production, no SMTP     -> OutboxMailService   (dev/test capture)
///   - production, no SMTP         -> UnavailableMailService (fails clearly)
///
/// The dev/test outbox is never returned for production, so it can never become
/// a silent production fallback.
export function createMailService(selection: MailServiceSelection): MailService {
  const marketingUrl = selection.marketingUrl ?? DEFAULT_EMAIL_BRANDING.marketingUrl;
  if (selection.smtpUrl) {
    return new SmtpMailService(selection.smtpUrl, selection.mailFrom, marketingUrl);
  }
  if (selection.nodeEnv !== "production") {
    return new OutboxMailService(selection.outbox);
  }
  return new UnavailableMailService();
}
