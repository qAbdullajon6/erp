import { assertSafeWebhookUrl, isSafeWebhookUrl, WebhookUrlError } from "./webhook-url.util";

describe("assertSafeWebhookUrl — SSRF protection", () => {
  it("allows a normal public https endpoint", () => {
    expect(() => assertSafeWebhookUrl("https://example.com/hook")).not.toThrow();
    expect(() => assertSafeWebhookUrl("https://hooks.example.com:8443/a/b?c=d")).not.toThrow();
  });

  it("allows public http", () => {
    // Discouraged but not our call to forbid: plenty of internal-to-them
    // receivers are plain http behind their own TLS terminator.
    expect(() => assertSafeWebhookUrl("http://example.com/hook")).not.toThrow();
  });

  it("blocks the cloud metadata service", () => {
    // The single highest-value SSRF target: it hands out cloud credentials.
    expect(() => assertSafeWebhookUrl("http://169.254.169.254/latest/meta-data/")).toThrow(WebhookUrlError);
  });

  it("blocks loopback", () => {
    for (const url of [
      "http://localhost/hook",
      "http://LOCALHOST/hook",
      "http://127.0.0.1/hook",
      "http://127.1.2.3/hook",
      "http://[::1]/hook",
      "http://0.0.0.0/hook",
    ]) {
      expect(() => assertSafeWebhookUrl(url)).toThrow(WebhookUrlError);
    }
  });

  it("blocks RFC1918 private ranges", () => {
    for (const url of [
      "http://10.0.0.1/hook",
      "http://10.255.255.255/hook",
      "http://192.168.1.1/hook",
      "http://172.16.0.1/hook",
      "http://172.31.255.255/hook",
    ]) {
      expect(() => assertSafeWebhookUrl(url)).toThrow(WebhookUrlError);
    }
  });

  it("does not over-block 172.x addresses outside the private range", () => {
    // 172.16-31 is private; 172.15 and 172.32 are public. A regex that blocked
    // all of 172.* would silently break legitimate receivers.
    expect(() => assertSafeWebhookUrl("http://172.15.0.1/hook")).not.toThrow();
    expect(() => assertSafeWebhookUrl("http://172.32.0.1/hook")).not.toThrow();
  });

  it("blocks IPv6 unique-local and link-local", () => {
    for (const url of ["http://[fc00::1]/hook", "http://[fd12::1]/hook", "http://[fe80::1]/hook"]) {
      expect(() => assertSafeWebhookUrl(url)).toThrow(WebhookUrlError);
    }
  });

  it("blocks non-HTTP protocols", () => {
    for (const url of ["file:///etc/passwd", "gopher://example.com/", "ftp://example.com/x"]) {
      expect(() => assertSafeWebhookUrl(url)).toThrow(WebhookUrlError);
    }
  });

  it("rejects strings that are not URLs at all", () => {
    for (const url of ["", "not a url", "://missing-scheme"]) {
      expect(() => assertSafeWebhookUrl(url)).toThrow(WebhookUrlError);
    }
  });

  describe("with allowPrivateTargets (development only)", () => {
    it("permits loopback so a developer can point at a local receiver", () => {
      expect(() => assertSafeWebhookUrl("http://127.0.0.1:9000/hook", true)).not.toThrow();
      expect(() => assertSafeWebhookUrl("http://localhost:9000/hook", true)).not.toThrow();
    });

    it("permits a receiver on the developer's LAN", () => {
      expect(() => assertSafeWebhookUrl("http://192.168.1.50:9000/hook", true)).not.toThrow();
    });

    it("STILL blocks the cloud metadata service", () => {
      // The flag exists to allow a loopback/LAN receiver. Nothing legitimate
      // lives on a link-local address, and 169.254.169.254 hands out instance
      // credentials — so the escape hatch must not reach it even in dev, where
      // a developer working on a cloud VM would otherwise expose it.
      expect(() => assertSafeWebhookUrl("http://169.254.169.254/latest/meta-data/", true)).toThrow(
        WebhookUrlError,
      );
      expect(() => assertSafeWebhookUrl("http://[fd00:ec2::254]/latest/meta-data/", true)).toThrow(
        WebhookUrlError,
      );
      expect(() => assertSafeWebhookUrl("http://[fe80::1]/hook", true)).toThrow(WebhookUrlError);
    });

    it("still blocks non-HTTP protocols", () => {
      // The flag loosens WHERE we may connect, never HOW. A file:// URL is
      // never a webhook receiver, in any environment.
      expect(() => assertSafeWebhookUrl("file:///etc/passwd", true)).toThrow(WebhookUrlError);
    });

    it("still rejects non-URLs", () => {
      expect(() => assertSafeWebhookUrl("not a url", true)).toThrow(WebhookUrlError);
    });
  });
});

describe("isSafeWebhookUrl", () => {
  it("mirrors assertSafeWebhookUrl without throwing", () => {
    expect(isSafeWebhookUrl("https://example.com/hook")).toBe(true);
    expect(isSafeWebhookUrl("http://10.0.0.1/hook")).toBe(false);
    expect(isSafeWebhookUrl("http://10.0.0.1/hook", true)).toBe(true);
  });
});
