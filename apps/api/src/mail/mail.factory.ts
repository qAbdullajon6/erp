import { MailService } from "./mail.service";
import { MailOutbox } from "./mail.outbox";
import { OutboxMailService } from "./providers/outbox-mail.service";
import { SmtpMailService } from "./providers/smtp-mail.service";
import { UnavailableMailService } from "./providers/unavailable-mail.service";

export interface MailServiceSelection {
  nodeEnv: string;
  smtpUrl?: string;
  mailFrom?: string;
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
  if (selection.smtpUrl) {
    return new SmtpMailService(selection.smtpUrl, selection.mailFrom);
  }
  if (selection.nodeEnv !== "production") {
    return new OutboxMailService(selection.outbox);
  }
  return new UnavailableMailService();
}
