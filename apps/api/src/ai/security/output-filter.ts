import { Injectable, Logger } from "@nestjs/common";

export interface FilterResult {
  text: string;
  filtered: boolean;
  reasons: string[];
}

/// Secrets that must never appear in an answer, whatever the model was thinking.
///
/// This is a LAST line, not the first. The structural defence is that the model
/// is never given a tool returning a secret: no tool returns an API key hash, a
/// password hash, a JWT or a webhook signing secret, so in normal operation
/// there is nothing here to catch.
///
/// It exists for the case those defences are wrong — a future tool that returns
/// too much, a model that memorised a key from a pasted error message, an
/// operator who pastes a token into chat and asks about it. Catching that costs
/// one regex pass over the output; missing it puts a live credential on screen
/// and into the conversation history.
const SECRET_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  // This product's own credentials — the formats are known exactly, so these
  // cannot false-positive.
  { name: "flowerp_api_key", pattern: /\bflowerp_live_[A-Za-z0-9_-]{8,}/g },
  { name: "webhook_secret", pattern: /\bwhsec_[A-Za-z0-9_-]{8,}/g },
  // Third-party keys, in case one is pasted into a conversation.
  { name: "anthropic_key", pattern: /\bsk-ant-[A-Za-z0-9_-]{16,}/g },
  { name: "openai_key", pattern: /\bsk-[A-Za-z0-9]{20,}/g },
  { name: "google_key", pattern: /\bAIza[A-Za-z0-9_-]{30,}/g },
  { name: "bearer_token", pattern: /\bBearer\s+[A-Za-z0-9._-]{20,}/gi },
  // A JWT is three base64url segments; the eyJ prefix is the encoded '{"'.
  { name: "jwt", pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
  // Argon2/bcrypt digests, if a row ever reached the model.
  { name: "password_hash", pattern: /\$(argon2(id|i|d)|2[aby])\$[^\s]{16,}/g },
  { name: "database_url", pattern: /\b(postgres(ql)?|mysql|mongodb):\/\/[^\s@]+:[^\s@]+@[^\s]+/gi },
];

const REDACTION = "[redacted]";

@Injectable()
export class OutputFilter {
  private readonly logger = new Logger(OutputFilter.name);

  /// Redacts anything credential-shaped from a completed answer.
  filter(text: string): FilterResult {
    if (!text) return { text, filtered: false, reasons: [] };

    let out = text;
    const reasons: string[] = [];

    for (const { name, pattern } of SECRET_PATTERNS) {
      // Fresh lastIndex per call — a /g regex is stateful, and a shared one
      // silently skips matches on every other invocation.
      pattern.lastIndex = 0;
      if (pattern.test(out)) {
        pattern.lastIndex = 0;
        out = out.replace(pattern, REDACTION);
        reasons.push(name);
      }
    }

    if (reasons.length > 0) {
      this.logger.error(
        `AI output contained secret-shaped content and was redacted: ${reasons.join(", ")}. ` +
          `This should not happen — no tool returns credentials; investigate which one did.`,
      );
    }

    return { text: out, filtered: reasons.length > 0, reasons };
  }

  /// Streaming variant.
  ///
  /// A secret can straddle two chunks — "flowerp_live_" in one and the body in
  /// the next — so filtering each chunk in isolation would let it through split
  /// across the wire and reassembled in the browser. This holds back a small
  /// tail (the longest a pattern's prefix could be) until the next chunk proves
  /// it is not the start of a secret.
  ///
  /// The cost is that the last few characters of a stream arrive one chunk late;
  /// `flush()` releases them at the end.
  createStreamFilter(): StreamOutputFilter {
    return new StreamOutputFilter(this);
  }
}

/// The longest prefix any pattern needs to start matching, plus headroom. A
/// secret is never split further back than this.
const CARRY_CHARS = 24;

export class StreamOutputFilter {
  private carry = "";
  private everFiltered = false;
  private readonly allReasons = new Set<string>();

  constructor(private readonly filter: OutputFilter) {}

  /// Filters a chunk, returning what is safe to emit now.
  push(chunk: string): string {
    const combined = this.carry + chunk;

    // Anything but the tail is safe to scan: a secret starting in the tail
    // cannot be confirmed until more arrives.
    const splitAt = Math.max(0, combined.length - CARRY_CHARS);
    const settled = combined.slice(0, splitAt);
    this.carry = combined.slice(splitAt);

    if (!settled) return "";

    const result = this.filter.filter(settled);
    if (result.filtered) {
      this.everFiltered = true;
      for (const reason of result.reasons) this.allReasons.add(reason);
    }
    return result.text;
  }

  /// Releases the held-back tail. Must be called when the stream ends, or the
  /// last few characters of every answer are lost.
  flush(): string {
    if (!this.carry) return "";
    const result = this.filter.filter(this.carry);
    this.carry = "";
    if (result.filtered) {
      this.everFiltered = true;
      for (const reason of result.reasons) this.allReasons.add(reason);
    }
    return result.text;
  }

  get filtered(): boolean {
    return this.everFiltered;
  }

  get reasons(): string[] {
    return [...this.allReasons];
  }
}
