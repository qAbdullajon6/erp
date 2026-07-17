export interface SseEvent {
  event?: string;
  data: string;
}

/// Incremental server-sent-events parser over a fetch response body.
///
/// Shared by every provider adapter: OpenAI, Anthropic, Gemini and Ollama all
/// stream, and three of them speak SSE. Writing this once is the difference
/// between one correct framing implementation and four subtly wrong ones.
///
/// The framing is the whole point. A network chunk has no relationship to an
/// SSE event: one chunk can carry three events, and one event can straddle
/// three chunks — including *mid-UTF-8-character*. Naively doing
/// `chunk.toString()` per chunk corrupts any multi-byte character that lands on
/// a boundary, which for this product means a mangled accented company name in
/// the middle of an answer. TextDecoder with `stream: true` holds the partial
/// sequence until the rest arrives.
export async function* parseSseStream(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<SseEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  try {
    for (;;) {
      if (signal?.aborted) return;

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Events are separated by a blank line. \r\n\r\n is tolerated because the
      // spec allows CRLF and some proxies rewrite line endings.
      let separator = findSeparator(buffer);
      while (separator !== -1) {
        const raw = buffer.slice(0, separator.index);
        buffer = buffer.slice(separator.index + separator.length);

        const parsed = parseEvent(raw);
        if (parsed) yield parsed;

        separator = findSeparator(buffer);
      }
    }

    // Flush whatever the decoder is still holding, then emit a trailing event
    // that arrived without its blank line (some providers close the stream
    // immediately after the last one).
    buffer += decoder.decode();
    const trailing = parseEvent(buffer);
    if (trailing) yield trailing;
  } finally {
    // Releasing the lock lets the underlying socket be torn down on cancel;
    // without it an aborted stream leaks the connection until GC.
    reader.releaseLock();
  }
}

function findSeparator(buffer: string): { index: number; length: number } | -1 {
  const lf = buffer.indexOf("\n\n");
  const crlf = buffer.indexOf("\r\n\r\n");

  if (lf === -1 && crlf === -1) return -1;
  if (crlf !== -1 && (lf === -1 || crlf < lf)) return { index: crlf, length: 4 };
  return { index: lf, length: 2 };
}

/// Parses one event block. Returns null for a block that carries no data —
/// a comment (`: keep-alive`, which providers send to hold the connection open)
/// or an empty trailer.
function parseEvent(raw: string): SseEvent | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;

  let event: string | undefined;
  const dataLines: string[] = [];

  for (const line of trimmed.split(/\r?\n/)) {
    // Per spec a leading colon is a comment. This is how keep-alives arrive,
    // and treating one as data would feed `""` to JSON.parse.
    if (line.startsWith(":")) continue;

    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    // Exactly one optional leading space is stripped, per spec — not trimmed,
    // because significant whitespace inside a data payload must survive.
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);

    if (field === "event") event = value;
    else if (field === "data") dataLines.push(value);
  }

  if (dataLines.length === 0) return null;
  // Multiple data: lines in one event are joined with newlines, per spec.
  return { event, data: dataLines.join("\n") };
}
