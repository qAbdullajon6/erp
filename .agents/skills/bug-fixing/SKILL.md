---
name: bug-fixing
description: Diagnoses and fixes defects in FlowERP with root-cause discipline — reproduce, find the actual cause, fix minimally, verify. Use for any reported or discovered bug, distinct from refactoring (no behavior change) or crud-module-development (new features).
---

# Bug Fixing

## Purpose

Fixes real defects with the same rigor this codebase already demonstrates in
its own history — see `TECHNICAL_DEBT.md`'s paid-off entries for the standard:
each names the exact cause, the exact fix, and confirms via a specific test or
data check, not a guess.

## When to Use

- A specific, reproducible incorrect behavior has been reported or found.
- Not for: vague "this feels off" requests (→ [[ui-polish]] or
  [[refactoring]]), or missing features (→ the relevant module skill).

## Responsibilities

- Reproduce the bug before touching code — know the exact input/state that
  triggers it.
- Find the actual root cause, not the nearest plausible-looking code. This
  app's own debt log shows the discipline: TD-005's fix wasn't "patch the
  three drifted dispatches" alone, it was recognizing *why* they could drift
  (order status changes not moving the dispatch) and confirming that path was
  already closed by Task 8.5 before treating the three rows as a one-time data
  repair rather than an ongoing code defect.
- Fix at the right layer — if the bug is "the board let an illegal drag
  through," check whether `allowedTransitions` was stale (a cache/invalidation
  bug) before assuming `board-columns.ts` needs new logic (see
  [[dispatch-board]] — that file must never grow business rules).
- Add or fix a test that would have caught the bug, where the bug represents a
  real gap in coverage.

## Workflow

1. Reproduce with the exact reported input/state.
2. Trace backward from the symptom to the actual cause — read the real code
   path, don't assume based on a similar bug seen before.
3. Determine whether this is a code defect (fix it) or a data-state issue from
   before a code fix landed (a data repair, documented as such — see
   `TECHNICAL_DEBT.md`'s pattern of separating "the code doesn't need fixing,
   this data predates the fix" from genuine open defects).
4. Make the minimal fix at the correct layer.
5. Verify: the original reproduction no longer fails, the full relevant test
   suite still passes, and — if the bug reveals a coverage gap — add a test
   that pins the fixed behavior.
6. State the failure scenario precisely when reporting the fix (exact
   input/state → exact wrong output), not a vague description.

## Rules

- Never fix a symptom without identifying the cause — a fix that "makes the
  error go away" without explaining why it was happening is not done.
- Never fix business logic in a presentation-layer file (see
  [[dispatch-board]]'s "no `canMoveTo()` here" rule) — trace to the real
  source of truth.
- Never silently expand scope into an unrelated refactor while fixing a bug.

## Best Practices

- Check `TECHNICAL_DEBT.md` before fixing anything that touches dispatch/order
  state — the bug may already be a known, deliberately-recorded decision
  rather than an oversight.
- When a bug turns out to be bad historical data rather than a code defect,
  say so explicitly and treat the fix as a data repair, not a code change —
  and record it if the project's debt-log convention applies.

## Never Do

- Never patch around a root cause with a special-case check that leaves the
  underlying bug reachable another way.
- Never fix a bug by weakening a guard, validation, or invariant.
- Never claim a fix is verified without actually reproducing the original
  failure and confirming it's resolved.

## Checklist

- [ ] Bug reproduced with exact input/state.
- [ ] Root cause identified and traced to the correct layer.
- [ ] Fix is minimal and doesn't bundle unrelated changes.
- [ ] Original reproduction confirmed fixed.
- [ ] Full relevant test suite still passes; a new test added if a coverage
      gap was found.

## Expected Output

A minimal, root-cause fix with a precise failure-scenario description, a
confirmed-resolved reproduction, and passing tests — or, if the "bug" is
actually pre-existing bad data, an explicit data-repair note instead of a code
change.
