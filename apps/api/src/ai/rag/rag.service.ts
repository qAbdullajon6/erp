import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

export interface RetrievedChunk {
  title: string;
  content: string;
  reference: string | null;
  source: string;
  score: number;
}

/// How many chunks reach the prompt. Retrieval's value is that it does NOT send
/// the corpus — three good chunks beat thirty mediocre ones, and every extra one
/// is tokens spent plus a chance to distract the model.
const TOP_K = 3;
/// Below this, `ts_rank` is matching on a stray common word. Sending that is
/// worse than sending nothing: irrelevant "reference material" invites the model
/// to use it.
const MIN_SCORE = 0.01;
/// Per-chunk ceiling. Chunks are already sized at ingest; this is a backstop
/// against one oversized row blowing the budget.
const MAX_CHUNK_CHARS = 1_200;

/// Retrieval-augmented generation over the product's own documentation.
///
/// Postgres full-text search, not a vector database. The corpus is a few hundred
/// chunks of documentation — at that size, `ts_rank` over a GIN index returns
/// the right chunk, and a second datastore would add an operational dependency,
/// an embedding provider, and a sync problem to solve a recall gap that does not
/// exist yet. Recorded in TECHNICAL_DEBT.md as the thing to revisit when
/// customer-uploaded policy documents make the corpus large and the vocabulary
/// unpredictable.
@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);

  constructor(private readonly prisma: PrismaService) {}

  /// Finds documentation relevant to a question.
  ///
  /// Scoped so a customer's own uploaded policy is visible only to their
  /// organization, while built-in product docs (organizationId IS NULL) are
  /// shared. That scoping is in the SQL, not applied afterwards — a filter you
  /// forget to apply is a leak.
  async retrieve(organizationId: string, query: string): Promise<RetrievedChunk[]> {
    const cleaned = this.toTsQuery(query);
    if (!cleaned) return [];

    try {
      const rows = await this.prisma.$queryRaw<
        Array<{ title: string; content: string; reference: string | null; source: string; score: number }>
      >`
        SELECT
          "title",
          "content",
          "reference",
          "source",
          ts_rank(
            to_tsvector('english', "title" || ' ' || "content"),
            to_tsquery('english', ${cleaned})
          ) AS score
        FROM "ai_knowledge_docs"
        WHERE
          ("organizationId" IS NULL OR "organizationId" = ${organizationId})
          AND to_tsvector('english', "title" || ' ' || "content")
              @@ to_tsquery('english', ${cleaned})
        ORDER BY score DESC
        LIMIT ${TOP_K}
      `;

      return rows
        .filter((r) => r.score >= MIN_SCORE)
        .map((r) => ({
          ...r,
          content: r.content.length > MAX_CHUNK_CHARS
            ? `${r.content.slice(0, MAX_CHUNK_CHARS)}…`
            : r.content,
        }));
    } catch (err) {
      // Retrieval is an enhancement. A malformed query or a missing index must
      // degrade the answer, not fail the conversation.
      this.logger.warn(
        `RAG retrieval failed, continuing without it: ${err instanceof Error ? err.message : String(err)}`,
      );
      return [];
    }
  }

  /// Turns a natural-language question into a safe tsquery.
  ///
  /// The user's text NEVER reaches to_tsquery unescaped: that function throws a
  /// syntax error on stray `&`, `|`, `!` or `:` — which a normal question
  /// contains — and its error would surface as a failed chat turn. Everything
  /// non-alphanumeric is stripped, terms are OR'd (a question rarely contains
  /// every word of the answer), and each gets `:*` so "invoic" matches
  /// "invoicing".
  ///
  /// It is also the injection boundary: after this, only [a-z0-9] and the
  /// operators we added survive, so there is no tsquery syntax left for a user
  /// to smuggle in. The value is still passed as a bound parameter.
  private toTsQuery(query: string): string | null {
    const terms = query
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2 && !STOP_WORDS.has(t))
      // More than eight terms is a paragraph, not a query; the tail adds noise.
      .slice(0, 8);

    if (terms.length === 0) return null;
    return terms.map((t) => `${t}:*`).join(" | ");
  }

  /// Renders retrieved chunks for the prompt, with their source, so the model
  /// can cite where an answer came from.
  render(chunks: RetrievedChunk[]): string | undefined {
    if (chunks.length === 0) return undefined;
    return chunks
      .map((c) => `### ${c.title}${c.reference ? ` (${c.reference})` : ""}\n${c.content}`)
      .join("\n\n");
  }
}

/// Words that match everything and therefore rank nothing. Not exhaustive —
/// just the ones that dominate an English question.
const STOP_WORDS = new Set([
  "the", "and", "for", "are", "but", "not", "you", "all", "can", "has", "have",
  "how", "what", "why", "when", "who", "which", "does", "did", "was", "were",
  "with", "from", "this", "that", "there", "their", "them", "then", "than",
  "into", "our", "out", "get", "got", "show", "tell", "give", "please",
]);
