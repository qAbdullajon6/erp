---
name: database-migrations
description: Owns Prisma schema changes and migrations for FlowERP's PostgreSQL database (apps/api/prisma/*) — additive-first, backfill-aware, exclusion-constraint-conscious. Use for any schema.prisma change or new migration.
---

# Database & Prisma Migrations

## Purpose

Owns `apps/api/prisma/schema.prisma` and `apps/api/prisma/migrations/*`. Schema
changes here are genuinely hard to reverse once deployed — this skill exists
because "Database sxemasini ruxsatsiz o'zgartirmaslik" (don't change the schema
without authorization) is one of this project's explicit standing rules.

## When to Use

- Adding/changing a model, field, index, or constraint in `schema.prisma`.
- Writing a data migration/backfill.
- Reviewing whether a migration is safe to run against live data.

## Responsibilities

- Never modify a migration file that has already been applied anywhere beyond
  the current developer's own machine — once shared, a migration is immutable;
  a correction is a new migration.
- Prefer additive changes (new nullable column, new table) over destructive
  ones (dropping a column, narrowing a type) in a single step — a two-step
  migration (add nullable → backfill → make required in a later migration) is
  safer for anything with production data.
- Some invariants in this app are enforced at the database level on purpose —
  e.g. dispatch overlap/exclusion constraints
  (`add_dispatch_assignment_and_overlap_constraints`). `TECHNICAL_DEBT.md` notes
  explicitly that the SQL `WHERE status IN (...)` predicate behind such a
  constraint "cannot import TypeScript" and must be kept in sync with the
  application-level status list by hand, documented in the migration — this is
  the one place a rule is deliberately encoded twice, and it must never be
  wrong.
- Data repairs (fixing bad rows, like the drifted-dispatch repair in
  `repair-drifted-dispatches.ts`) are distinct from schema migrations — know
  which one a task actually needs.

## Workflow

1. Write the `schema.prisma` change.
2. Generate the migration (`prisma migrate dev`) and read the generated SQL —
   don't assume it matches intent; Prisma's diff can include an unexpected
   drop/rename.
3. For anything with existing production-shaped data (a new required column, a
   new constraint that existing rows might violate), plan the multi-step path:
   nullable-add → backfill script → constrain in a follow-up migration.
4. If the change encodes a business rule at the database level (a check/
   exclusion constraint), cross-reference it against the application-level
   definition of that rule and document the correspondence in the migration
   file or an adjacent comment — see the exclusion-constraint precedent above.
5. Test against a realistic dataset (the seed script, `seed-test-org.ts`) before
   considering the migration done, not just against an empty database.

## Rules

- Never edit an already-applied/shared migration file — write a new one.
- Never drop a column or table in the same migration that stops writing to it —
  give a deploy cycle of separation so a rollback of the application code
  doesn't hit a missing column.
- Never hand-write a data backfill that fabricates history that doesn't exist
  (see TD-004: legacy dispatches with no assignment history — the backfill
  creates missing `Dispatch` rows but deliberately does NOT invent assignment
  history that was never recorded).
- Never let a database-level constraint drift from its application-level
  counterpart without both being updated together.

## Best Practices

- Name migrations descriptively (matching the existing
  `<timestamp>_<snake_case_description>` convention).
- Keep `seed-test-org.ts` in sync with schema changes so local/dev/test setup
  keeps working.
- Run the full migration + seed + app boot locally before considering a schema
  change ready for review.

## Never Do

- Never run a destructive migration directly against a shared/production
  database without a tested rollback/backup plan.
- Never fabricate historical data to satisfy a new NOT NULL constraint —
  backfill with real derivable values, or leave the gap explicitly documented
  (as TD-004 does), never invent plausible-looking fake history.
- Never bypass `prisma migrate` by hand-editing the database schema directly.

## Checklist

- [ ] Schema change generates the expected migration SQL (reviewed, not
      assumed).
- [ ] Destructive changes staged across migrations where production data may
      exist.
- [ ] Any DB-level business-rule constraint cross-checked against its
      application-level definition.
- [ ] Seed script updated if it now needs new required fields.
- [ ] Tested against a realistic (seeded) dataset, not just an empty DB.

## Expected Output

A migration that applies cleanly, matches intent when the generated SQL is
read, stages any destructive change safely, and keeps any duplicated
database/application rule pair in sync.
