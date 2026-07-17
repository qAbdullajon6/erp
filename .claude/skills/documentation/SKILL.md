---
name: documentation
description: Maintains FlowERP's docs/*.md architecture docs and the TECHNICAL_DEBT.md register in their established voice and format. Use when writing/updating a docs/ file, or recording a new technical-debt entry.
---

# Documentation

## Purpose

Maintains `docs/*.md` (architecture/API docs like `DISPATCH_API.md`,
`ORDERS_DISPATCH_API.md`, `FINANCE_API.md`, `AUTH_ONBOARDING.md`,
`E2E_TESTING.md`) and `docs/TECHNICAL_DEBT.md` in the voice this project has
already established: precise, cites real file/rule names, explains *why* not
just *what*, and never pads. Match that voice — don't introduce a generic
corporate-docs tone.

## When to Use

- Adding or updating a `docs/*.md` file after a real architectural change.
- Recording a new technical-debt entry, or marking one paid off.
- Writing an ADR-style decision record.

## Responsibilities

- Keep docs synchronized with reality — a doc describing an endpoint that no
  longer exists (as `TECHNICAL_DEBT.md`'s TD-008 describes for a stale test)
  is worse than no doc.
- Follow `TECHNICAL_DEBT.md`'s existing entry format exactly when adding a new
  debt entry: a title naming the specific problem, **Status**, **Found**/
  **Incurred**, **Relates to** (rule numbers if applicable), a precise
  description of what's wrong and why, and — critically — either a real fix or
  an explicit, reasoned explanation of why it's deliberately not being fixed
  yet. When an entry is paid off, move it under "Paid off" with a `~~strikethrough~~`
  title and a one-line summary of the actual fix, collapsing the original
  detail into a `<details>` block rather than deleting the history.
- Write architecture docs (`*_API.md`) from the actual controller/service code,
  not from a plan or an assumption — verify endpoint signatures, role
  requirements, and request/response shapes against the real source.

## Workflow

1. Before writing, read the real code the doc describes — don't document an
   intended design that doesn't match what shipped.
2. Match the existing doc's structure and tone if updating one; for a new doc,
   follow the closest existing example (`DISPATCH_API.md` for an API doc,
   `TECHNICAL_DEBT.md` for a debt entry).
3. For technical debt: decide status honestly — OPEN (not yet fixed, with a
   reason), accepted (a permanent, reasoned trade-off), or paid off (with the
   real fix named). Don't record something as "paid off" without confirming
   the fix actually landed and is tested.
4. Cross-reference related rules/ADRs/tasks by their existing names (R-numbers,
   ADR-001, Task numbers) rather than re-describing them inline every time.

## Rules

- Never document a design that isn't what's actually implemented.
- Never delete a technical-debt entry's history when it's paid off — collapse
  it into a `<details>` block, don't erase the record of what was wrong and
  why.
- Never pad an entry with generic filler — every sentence should carry real
  information, matching the existing docs' density.

## Best Practices

- Write the "why" before the "what" — this project's docs consistently lead
  with the reasoning (why a decision was made, why it's safe) rather than a
  dry restatement of the code.
- Keep API docs current with the actual `@Roles()` lists — a docs file with a
  stale role requirement is actively misleading.

## Never Do

- Never write a doc entry that could be true in the future but isn't true now.
- Never invent a rule number or ADR reference that doesn't exist.

## Checklist

- [ ] Doc content verified against actual current code, not assumption.
- [ ] Technical-debt entries follow the established format (Status/Found/
      Relates to/reasoning).
- [ ] Paid-off entries collapsed into `<details>`, not deleted.
- [ ] Voice matches the existing docs — precise, reasoned, no filler.

## Expected Output

A doc or debt-register update that's accurate against real code, follows the
established format, and reads consistently with the rest of `docs/`.
