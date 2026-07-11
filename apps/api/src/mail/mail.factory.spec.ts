import { Logger } from "@nestjs/common";
import { createMailService } from "./mail.factory";
import { MailOutbox } from "./mail.outbox";
import { OutboxMailService } from "./providers/outbox-mail.service";
import { SmtpMailService } from "./providers/smtp-mail.service";
import { UnavailableMailService } from "./providers/unavailable-mail.service";
import { redactEmail } from "./mail.util";
import type { InvitationEmailMessage } from "./mail.service";

const sampleMessage: InvitationEmailMessage = {
  to: "jane.doe@example.com",
  organizationName: "Acme Logistics",
  inviterName: "Alex Admin",
  acceptUrl: "https://app.flowerp.uz/auth/accept-invite?token=SUPER-SECRET-TOKEN",
  expiresAt: new Date("2026-07-17T00:00:00.000Z"),
};

describe("createMailService — provider selection", () => {
  it("uses the dev outbox when non-production and SMTP is not configured", () => {
    const svc = createMailService({ nodeEnv: "development", outbox: new MailOutbox() });
    expect(svc).toBeInstanceOf(OutboxMailService);
  });

  it("uses the dev outbox under NODE_ENV=test", () => {
    const svc = createMailService({ nodeEnv: "test", outbox: new MailOutbox() });
    expect(svc).toBeInstanceOf(OutboxMailService);
  });

  it("uses SMTP whenever SMTP_URL is configured, even in development", () => {
    const svc = createMailService({
      nodeEnv: "development",
      smtpUrl: "smtp://user:pass@localhost:2525",
      mailFrom: "FlowERP <no-reply@flowerp.uz>",
      outbox: new MailOutbox(),
    });
    expect(svc).toBeInstanceOf(SmtpMailService);
  });

  it("uses SMTP in production when SMTP_URL is configured", () => {
    const svc = createMailService({
      nodeEnv: "production",
      smtpUrl: "smtp://user:pass@localhost:2525",
      outbox: new MailOutbox(),
    });
    expect(svc).toBeInstanceOf(SmtpMailService);
  });

  it("uses the unavailable provider in production when SMTP is not configured", () => {
    const svc = createMailService({ nodeEnv: "production", outbox: new MailOutbox() });
    expect(svc).toBeInstanceOf(UnavailableMailService);
  });
});

describe("production no-SMTP safety rule", () => {
  let errorSpy: jest.SpyInstance;
  let debugSpy: jest.SpyInstance;

  beforeEach(() => {
    errorSpy = jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    debugSpy = jest.spyOn(Logger.prototype, "debug").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("rejects with a generic error and records nothing when called", async () => {
    const outbox = new MailOutbox();
    const svc = createMailService({ nodeEnv: "production", outbox });

    await expect(svc.sendInvitationEmail(sampleMessage)).rejects.toThrow(
      "Email delivery is not configured",
    );
    expect(outbox.list()).toHaveLength(0);
  });

  it("never logs the accept URL, token, or raw email; only a redacted recipient", async () => {
    const outbox = new MailOutbox();
    const svc = createMailService({ nodeEnv: "production", outbox });

    await expect(svc.sendInvitationEmail(sampleMessage)).rejects.toBeInstanceOf(Error);

    const logged = JSON.stringify(errorSpy.mock.calls);
    expect(logged).not.toContain(sampleMessage.acceptUrl);
    expect(logged).not.toContain("SUPER-SECRET-TOKEN");
    expect(logged).not.toContain(sampleMessage.to);
    expect(logged).toContain(redactEmail(sampleMessage.to));
    // The dev-only accept-URL log path must not run in production.
    expect(debugSpy).not.toHaveBeenCalled();
  });

  it("throws an error that carries no sensitive values", async () => {
    const svc = createMailService({ nodeEnv: "production", outbox: new MailOutbox() });

    let caught: Error | undefined;
    try {
      await svc.sendInvitationEmail(sampleMessage);
    } catch (e) {
      caught = e as Error;
    }

    // Exact message: no accept URL, token, recipient, or SMTP detail.
    expect(caught?.message).toBe("Email delivery is not configured");
  });
});

describe("dev outbox capture", () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, "debug").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("records the invitation so tests can inspect and clear it", async () => {
    const outbox = new MailOutbox();
    const svc = createMailService({ nodeEnv: "development", outbox });

    await svc.sendInvitationEmail(sampleMessage);

    expect(outbox.list()).toHaveLength(1);
    expect(outbox.last()?.organizationName).toBe("Acme Logistics");

    outbox.clear();
    expect(outbox.list()).toHaveLength(0);
  });
});

describe("redactEmail", () => {
  it("never returns the raw local part or domain", () => {
    const redacted = redactEmail("jane.doe@example.com");
    expect(redacted).toBe("j***@e***");
    expect(redacted).not.toContain("jane.doe");
    expect(redacted).not.toContain("example.com");
  });

  it("degrades to a fully-masked value for malformed input", () => {
    expect(redactEmail("not-an-email")).toBe("***");
    expect(redactEmail("@example.com")).toBe("***");
    expect(redactEmail("user@")).toBe("***");
  });
});
