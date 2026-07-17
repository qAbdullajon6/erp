import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { readdir, readFile, stat } from "fs/promises";
import { join, relative } from "path";
import { PrismaService } from "../../prisma/prisma.service";

/// Where the product's own documentation lives, relative to the API package.
const DOC_ROOTS = ["docs", "../../docs"];

/// Chunk sizing. A chunk must be small enough that three of them fit a prompt
/// budget comfortably, and large enough to carry a whole idea — a chunk cut
/// mid-explanation retrieves as noise.
const MAX_CHUNK_CHARS = 1_500;
const MIN_CHUNK_CHARS = 80;

/// Ingests the repo's markdown documentation into the RAG corpus.
///
/// The corpus is the product's REAL docs — AI_COPILOT_API.md, IMPORT_WIZARD_API.md,
/// DEVELOPER_PORTAL_API.md, the ADRs — not a hand-written FAQ that would drift
/// from them. When someone asks "how does the duplicate strategy work", the
/// answer is retrieved from the document that defines it, so the docs and the
/// Copilot cannot disagree.
///
/// Runs at boot and is idempotent: content is hashed into a stable id, so a
/// restart re-ingests without duplicating, and an edited doc replaces its old
/// chunks rather than accumulating both versions.
@Injectable()
export class KnowledgeSeeder implements OnModuleInit {
  private readonly logger = new Logger(KnowledgeSeeder.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    // Skipped under test: the e2e suite seeds the exact fixtures it asserts on,
    // and ingesting the real docs would make retrieval results depend on
    // whatever documentation happens to be in the tree.
    if (process.env.NODE_ENV === "test") return;

    try {
      const count = await this.seed();
      if (count > 0) this.logger.log(`Indexed ${count} documentation chunk(s) for AI retrieval`);
    } catch (err) {
      // Retrieval is an enhancement, not a dependency. A missing docs folder
      // must not stop the API from booting.
      this.logger.warn(
        `Could not index documentation for AI retrieval: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /// Ingests every markdown file under the docs roots. Returns the chunk count.
  async seed(): Promise<number> {
    const files = await this.findMarkdown();
    if (files.length === 0) return 0;

    const chunks: Array<{ id: string; title: string; content: string; reference: string }> = [];

    for (const file of files) {
      const text = await readFile(file.path, "utf8");
      for (const chunk of chunkMarkdown(text)) {
        chunks.push({
          id: stableId(`${file.name}#${chunk.heading}`),
          title: chunk.heading ? `${file.name} — ${chunk.heading}` : file.name,
          content: chunk.body,
          reference: chunk.heading ? `${file.name}#${slug(chunk.heading)}` : file.name,
        });
      }
    }

    if (chunks.length === 0) return 0;

    // Replace-then-insert, scoped to built-in docs (organizationId IS NULL), so
    // a customer's own uploaded policies are never touched by a redeploy.
    await this.prisma.$transaction([
      this.prisma.aiKnowledgeDoc.deleteMany({
        where: { organizationId: null, source: "documentation" },
      }),
      this.prisma.aiKnowledgeDoc.createMany({
        data: chunks.map((c) => ({
          id: c.id,
          organizationId: null,
          source: "documentation",
          title: c.title,
          content: c.content,
          reference: c.reference,
        })),
        skipDuplicates: true,
      }),
    ]);

    return chunks.length;
  }

  private async findMarkdown(): Promise<Array<{ path: string; name: string }>> {
    for (const root of DOC_ROOTS) {
      const absolute = join(process.cwd(), root);
      try {
        const info = await stat(absolute);
        if (!info.isDirectory()) continue;
        const entries = await readdir(absolute);
        const markdown = entries.filter((e) => e.toLowerCase().endsWith(".md"));
        if (markdown.length === 0) continue;
        return markdown.map((name) => ({
          path: join(absolute, name),
          name: relative(absolute, join(absolute, name)),
        }));
      } catch {
        // Root does not exist from this working directory; try the next.
        continue;
      }
    }
    return [];
  }
}

interface Chunk {
  heading: string;
  body: string;
}

/// Splits markdown on its headings.
///
/// By structure rather than by character count, because a document's own
/// headings are where its ideas actually divide — a fixed-size window cuts
/// mid-sentence and retrieves half an explanation. A section longer than the
/// budget is then split on paragraph boundaries, never mid-paragraph.
export function chunkMarkdown(text: string): Chunk[] {
  const lines = text.split(/\r?\n/);
  const sections: Chunk[] = [];

  let heading = "";
  let buffer: string[] = [];
  let inFence = false;

  const flush = () => {
    const body = buffer.join("\n").trim();
    buffer = [];
    if (body.length < MIN_CHUNK_CHARS) return;

    for (const part of splitLong(body)) {
      sections.push({ heading, body: part });
    }
  };

  for (const line of lines) {
    // A ``` inside a fence is content, and a '#' inside one is a comment, not a
    // heading — tracking the fence stops code samples from shattering a chunk.
    if (/^\s*```/.test(line)) inFence = !inFence;

    const match = !inFence ? /^(#{1,3})\s+(.*)$/.exec(line) : null;
    if (match) {
      flush();
      heading = match[2].trim();
      continue;
    }
    buffer.push(line);
  }
  flush();

  return sections;
}

/// Splits an oversized section on blank lines, keeping paragraphs whole.
function splitLong(body: string): string[] {
  if (body.length <= MAX_CHUNK_CHARS) return [body];

  const out: string[] = [];
  let current: string[] = [];
  let length = 0;

  for (const paragraph of body.split(/\n\s*\n/)) {
    if (length + paragraph.length > MAX_CHUNK_CHARS && current.length > 0) {
      out.push(current.join("\n\n"));
      current = [];
      length = 0;
    }
    current.push(paragraph);
    length += paragraph.length;
  }
  if (current.length > 0) out.push(current.join("\n\n"));

  return out.filter((c) => c.trim().length >= MIN_CHUNK_CHARS);
}

/// A deterministic uuid from the chunk's identity, so re-ingesting the same doc
/// produces the same row rather than a duplicate. Not cryptographic — this is
/// an identity, not a secret.
function stableId(key: string): string {
  let h1 = 0x12345678;
  let h2 = 0x9abcdef0;
  for (let i = 0; i < key.length; i++) {
    const c = key.charCodeAt(i);
    h1 = (Math.imul(h1 ^ c, 2654435761) >>> 0) ^ (h2 >>> 3);
    h2 = (Math.imul(h2 ^ c, 1597334677) >>> 0) ^ (h1 >>> 5);
  }
  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, "0");
  const a = hex(h1);
  const b = hex(h2);
  const c = hex(Math.imul(h1 ^ h2, 2246822519));
  const d = hex(Math.imul(h1 + h2, 3266489917));
  // Shaped as a v4 uuid so the column's type is honoured.
  return `${a}-${b.slice(0, 4)}-4${b.slice(5, 8)}-a${c.slice(1, 4)}-${c.slice(4)}${d}`.slice(0, 36);
}

function slug(heading: string): string {
  return heading.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
