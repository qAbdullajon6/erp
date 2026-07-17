# Import Wizard API

Bulk migration of existing data into FlowERP. Session-authenticated; every route
is under `/import` and scoped to the caller's organization.

## Pipeline

```
upload → (auto-map) → confirm mapping → validate → preview → execute → report
                                                                 ↓
                                                   cancel / resume / retry
```

Each step is a separate request against a persisted `ImportSession`, so a
migration survives a reload, a restart, or the user walking away.

---

## Supported entities

| Entity | Natural key | Auto-generated | Roles |
|---|---|---|---|
| Customer | `customerCode` | `CUS-0001` | ADMIN, OPERATIONS_MANAGER, SALES_CRM_MANAGER |
| Order | `orderNumber` | `ORD-0001` | ADMIN, OPERATIONS_MANAGER |
| Driver | `employeeCode` | `DRV-0001` | ADMIN, OPERATIONS_MANAGER, DISPATCHER |
| Vehicle | `vehicleCode` | `VEH-0001` | ADMIN, OPERATIONS_MANAGER, DISPATCHER |
| Expense | `expenseNumber` | `EXP-0001` | ADMIN, OPERATIONS_MANAGER, ACCOUNTANT |

Roles are declared **per entity** in the registry, not on the controller: a
DISPATCHER may import vehicles but not customers. `GET /import/entities` returns
only what the caller may actually import, so a UI built from it never offers an
option that 403s.

### Adding an entity

Add an `EntityDefinition` to `src/import/registry/entity-registry.ts`. Nothing
else changes — the parser, validator, mapper, preview, conflict handling, error
report and template are all driven off that table. If you find yourself writing
`if (entityType === ...)` in the engine, the registry is missing a field.

---

## Files

- **CSV** and **XLSX**. Format is detected from the file's **content** (zip magic
  number), never its extension or MIME type — a `.csv` that is really a zip is
  not handed to the CSV parser.
- Legacy `.xls` is rejected with a message telling the user to re-save.
- **10 MB** and **100,000 rows** maximum. Both are stated in the error rather
  than silently truncating.
- Duplicate column headers are rejected: renaming the second one (as most CSV
  parsers do) silently drops that column's data.
- XLSX formula cells import their **cached result** — the number the user sees —
  not the formula text.

---

## Endpoints

| Method | Path | Notes |
|---|---|---|
| `GET` | `/import/entities` | Importable entities + their fields, filtered by role |
| `POST` | `/import/sessions` | multipart: `file`, `entityType`. Parses and persists every row |
| `GET` | `/import/sessions` | History; `?page` `?limit` `?entityType` `?status` |
| `GET` | `/import/sessions/:id` | Session + statistics + first 200 errors |
| `PUT` | `/import/sessions/:id/mapping` | **Required before validate** |
| `POST` | `/import/sessions/:id/validate` | Validates every row; returns the preview |
| `POST` | `/import/sessions/:id/execute` | Accepts and returns `EXECUTING`; poll for progress |
| `POST` | `/import/sessions/:id/cancel` | Cooperative; stops between batches |
| `POST` | `/import/sessions/:id/resume` | Continues a CANCELLED/FAILED session |
| `POST` | `/import/sessions/:id/retry` | Re-runs only the FAILED rows |
| `GET` | `/import/sessions/:id/errors` | Full error report, CSV |
| `GET` | `/import/sessions/template/:entityType` | Blank template with an example row, CSV |
| `GET` | `/import/mappings/:entityType` | Saved mapping templates |
| `POST` | `/import/sessions/:id/mapping/save-template` | Save the current mapping for reuse |
| `DELETE` | `/import/mappings/:id` | Delete a template |

The two download routes are marked `@RawResponse()`, so their bodies are the file
itself. Every other route is wrapped in the standard `{ data: ... }` envelope —
wrapping a download produces a file whose bytes are JSON, which the browser still
saves as `.csv` and Excel then opens as garbage.

---

## Mapping

`POST /sessions` returns a `defaultMapping` (column index → field name) from
exact and alias matching on normalized headers.

Matching is **exact, not fuzzy**, deliberately. A fuzzy matcher that maps
"Delivery Cost" onto `price` because it shares a token is worse than no
suggestion: the user sees a filled-in dropdown, trusts it, and imports money into
the wrong column. A miss costs one dropdown; a wrong guess costs data.

The mapping must be confirmed via `PUT /sessions/:id/mapping` before validation —
validation runs against the **saved** mapping, never one passed inline. Rejected
at that point: a missing required field, two columns pointing at one field, an
unknown field name, or an out-of-range column index.

Templates are keyed by **header text**, not column index, so a saved mapping still
applies to next month's export even if its columns moved.

---

## Validation

Every row, every mapped cell. Errors are per **cell**, so one row reports all its
problems at once rather than one per upload.

Checked: required fields, email, phone, whole numbers, decimals (incl. European
`1.234,56`), negatives, ranges, string lengths, dates, enums, currency codes,
references, and duplicates.

**Dates** accept `YYYY-MM-DD`, `DD.MM.YYYY` and `YYYY/MM/DD`. Slash-separated
day/month (`01/02/2026`) is **rejected**, not guessed: it means January 2nd to a
US runtime and February 1st to a European user, and a wrong date that imports
cleanly is worse than one that is refused. Impossible dates (`2026-02-31`) are
rejected rather than rolled over.

**References** (a customer on an order, a driver on an expense) resolve by code,
name, email or plate — whichever the user happened to have. An unresolvable value
is an error naming the value they typed.

**Duplicates** are matched case-**sensitively**, because that is what the
`@@unique([organizationId, <key>])` constraint enforces. Matching case-insensitively
would call `CUS-1` and `cus-1` the same record when the database will store both.

Severity matters:
- A repeat **within the file** is an ERROR — no strategy makes "two rows claiming
  one code" coherent.
- A row matching an **existing record** is a WARNING — that is a decision, and
  failing validation would take the duplicate-strategy choice away from the user.
- A cell that looks like a **formula** is a WARNING: it is imported as literal
  text, and the user is told rather than having their data silently rewritten.

---

## Preview

`validate` returns what execution *would* do:

```json
{
  "totalRows": 1200, "validRows": 1180, "invalidRows": 20,
  "warnings": 35, "duplicates": 30,
  "newRecords": 1150, "updates": 30,
  "ignoredColumns": ["Legacy Notes"],
  "estimatedSeconds": 5,
  "errors": [ /* first 200; the rest are in the CSV report */ ],
  "preview": { "valid": [ /* 5 */ ], "invalid": [ /* 5 */ ] }
}
```

---

## Conflict strategies

Chosen at execute time, never inferred:

| Strategy | Behaviour |
|---|---|
| `SKIP` | Leave the existing record alone; count the row skipped |
| `UPDATE` | Overwrite its mapped fields (never its natural key or organization) |
| `ERROR` | Abort the entire import on the first duplicate |

---

## Execution

Asynchronous. `execute` marks the session `EXECUTING` and returns; the work
continues after the response, so a 50k-row import never holds a request open.
Poll `GET /import/sessions/:id` for `processedRows` / `totalRows`.

- **Batched**: 500 rows per transaction — the unit of both atomicity and progress.
- **Partial success**: if a batch rolls back, it is re-run row by row so one bad
  row costs one row, not 499 good ones. Each failure is attributed to its own row.
- **Idempotent**: a double-clicked Execute cannot run twice (compare-and-set on
  status). Resume only picks up rows never processed. Retry only touches FAILED
  rows.
- **Counters are derived** from the rows at settle time, never incremented, so a
  resumed or retried session's final report still matches reality.
- **Orders** get their opening `OrderStatusHistory` row in the same transaction
  (ADR-001/AR2) — a bare insert would produce an order invisible to the
  projection and the dispatch board.

Measured on a 50,000-row customer file (local Postgres, single instance):

| Phase | Time | Throughput |
|---|---|---|
| Parse + persist | ~20s | ~2,500 rows/s |
| Validate | ~29s | ~1,700 rows/s |
| Execute | ~147s | ~340 rows/s |

Memory is flat regardless of file size: the file is streamed, rows are persisted
in chunks, and execution pulls one batch at a time. Nothing ever holds the whole
file.

---

## Security

- **RBAC** per entity, from the registry.
- **Organization isolation**: every query is scoped; another org's session 404s.
- **Content sniffing**, size and row caps, and multipart limits (`fieldNameSize`,
  `fields`, `parts`) — see TD-020 for why the last of those matter.
- **CSV/formula injection** is neutralised in **both** directions: a leading
  `=`, `+`, `-` or `@` is prefixed with `'` on the way in (so a later export
  cannot execute it) and on the way out of every CSV we generate. Escaping only
  on output would leave the payload in the database for any other consumer.
- **Audit**: `import.upload`, `import.validate`, `import.execute`,
  `import.cancel`, `import.resume`, `import.retry` — each with the actor,
  organization and statistics.

---

## Configuration

Nothing to set. Limits are constants:

| Limit | Value | Where |
|---|---|---|
| File size | 10 MB | `MAX_IMPORT_FILE_BYTES` |
| Rows per file | 100,000 | `MAX_IMPORT_ROWS` |
| Columns | 200 | `MAX_COLUMNS` |
| Rows per transaction | 500 | `BATCH_SIZE` |
| Inline errors | 200 | `MAX_INLINE_ERRORS` |
