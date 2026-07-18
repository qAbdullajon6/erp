import { parseSseStream, type SseEvent } from "./sse-parser";

function makeStream(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  let index = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(chunks[index++]);
      } else {
        controller.close();
      }
    },
  });
}

function textChunks(...strings: string[]): Uint8Array[] {
  return strings.map((s) => new TextEncoder().encode(s));
}

async function collect(stream: ReadableStream<Uint8Array>, signal?: AbortSignal): Promise<SseEvent[]> {
  const events: SseEvent[] = [];
  for await (const event of parseSseStream(stream, signal)) {
    events.push(event);
  }
  return events;
}

describe("parseSseStream", () => {
  it("parses a complete SSE event", async () => {
    const stream = makeStream(textChunks("data: hello world\n\n"));
    const events = await collect(stream);
    expect(events).toHaveLength(1);
    expect(events[0].data).toBe("hello world");
  });

  it("parses multiple events in one chunk", async () => {
    const stream = makeStream(textChunks("data: first\n\ndata: second\n\n"));
    const events = await collect(stream);
    expect(events).toHaveLength(2);
    expect(events[0].data).toBe("first");
    expect(events[1].data).toBe("second");
  });

  it("handles events split across multiple chunks", async () => {
    const stream = makeStream(textChunks("data: par", "tial\n\n"));
    const events = await collect(stream);
    expect(events).toHaveLength(1);
    expect(events[0].data).toBe("partial");
  });

  it("handles named events", async () => {
    const stream = makeStream(textChunks('event: content_block_delta\ndata: {"type":"text"}\n\n'));
    const events = await collect(stream);
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe("content_block_delta");
    expect(events[0].data).toBe('{"type":"text"}');
  });

  it("ignores comment lines", async () => {
    const stream = makeStream(textChunks(": keep-alive\n\ndata: real\n\n"));
    const events = await collect(stream);
    expect(events).toHaveLength(1);
    expect(events[0].data).toBe("real");
  });

  it("handles CRLF line endings", async () => {
    const stream = makeStream(textChunks("data: crlf\r\n\r\n"));
    const events = await collect(stream);
    expect(events).toHaveLength(1);
    expect(events[0].data).toBe("crlf");
  });

  it("concatenates multi-line data fields", async () => {
    const stream = makeStream(textChunks("data: line1\ndata: line2\n\n"));
    const events = await collect(stream);
    expect(events).toHaveLength(1);
    expect(events[0].data).toBe("line1\nline2");
  });

  it("handles multi-byte UTF-8 characters split across chunks", async () => {
    const encoded = new TextEncoder().encode("data: café\n\n");
    // Split between the two bytes of 'é' (0xC3 0xA9)
    const eAccentPos = Array.from(encoded).findIndex((b, i) => b === 0xc3 && encoded[i + 1] === 0xa9);
    const chunk1 = encoded.slice(0, eAccentPos + 1); // ends with 0xC3 (first byte of é)
    const chunk2 = encoded.slice(eAccentPos + 1);    // starts with 0xA9 (second byte of é)

    const stream = makeStream([chunk1, chunk2]);
    const events = await collect(stream);
    expect(events).toHaveLength(1);
    expect(events[0].data).toBe("café");
  });

  it("handles trailing event without double newline", async () => {
    const stream = makeStream(textChunks("data: trailing"));
    const events = await collect(stream);
    expect(events).toHaveLength(1);
    expect(events[0].data).toBe("trailing");
  });

  it("respects abort signal", async () => {
    const controller = new AbortController();
    controller.abort();
    const stream = makeStream(textChunks("data: never\n\n"));
    const events = await collect(stream, controller.signal);
    expect(events).toHaveLength(0);
  });
});
