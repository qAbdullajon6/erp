import {
  SMTP_CONNECTION_TIMEOUT_MS,
  SMTP_GREETING_TIMEOUT_MS,
  SMTP_SOCKET_TIMEOUT_MS,
  buildSmtpTransportOptions,
} from "./smtp-mail.service";

describe("buildSmtpTransportOptions", () => {
  it("enforces STARTTLS, certificate verification, TLS 1.2, and bounded timeouts", () => {
    const options = buildSmtpTransportOptions(
      "smtp://mailer:p%40ss@smtp.example.com:587",
    );

    expect(options).toMatchObject({
      host: "smtp.example.com",
      port: 587,
      secure: false,
      requireTLS: true,
      auth: { user: "mailer", pass: "p@ss" },
      connectionTimeout: SMTP_CONNECTION_TIMEOUT_MS,
      greetingTimeout: SMTP_GREETING_TIMEOUT_MS,
      socketTimeout: SMTP_SOCKET_TIMEOUT_MS,
      tls: {
        servername: "smtp.example.com",
        rejectUnauthorized: true,
        minVersion: "TLSv1.2",
      },
    });
  });

  it("connects through SMTP_CONNECT_HOST while verifying the URL hostname", () => {
    const options = buildSmtpTransportOptions(
      "smtps://mailer:secret@smtp.example.com",
      " 192.0.2.10 ",
    );

    expect(options).toMatchObject({
      host: "192.0.2.10",
      port: 465,
      secure: true,
      requireTLS: false,
      tls: {
        servername: "smtp.example.com",
        rejectUnauthorized: true,
        minVersion: "TLSv1.2",
      },
    });
  });

  it.each([
    "http://user:secret@smtp.example.com",
    "smtp://user:secret@",
    "smtp://user:secret@smtp.example.com/path",
    "not-a-url-containing-secret",
  ])("rejects malformed SMTP URLs without echoing input", (smtpUrl) => {
    expect(() => buildSmtpTransportOptions(smtpUrl)).toThrow(
      "Invalid mail configuration",
    );

    try {
      buildSmtpTransportOptions(smtpUrl);
    } catch (error) {
      expect((error as Error).message).not.toContain(smtpUrl);
      expect((error as Error).message).not.toContain("secret");
    }
  });
});
