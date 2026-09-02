---
name: refactoring
description: Restructures existing FlowERP code without changing behavior — collapsing duplicated rules, extracting shared logic, decomposing oversized files. Use for pure refactors; use bug-fixing or crud-module-development instead when behavior should change.
---

# Refactoring

## Purpose

Handles behavior-preserving structural improvements: collapsing a rule that's
encoded in more than one place, extracting a growing component, or removing
dead code. This app has already paid off several refactors of exactly this
shape (see `TECHNICAL_DEBT.md`'s "Paid off" section — TD-010/TD-011 collapsed
duplicated dispatch-transition encodings into one derived source) — that's the
model to follow.

## When to Use

- The same rule/constant/logic is written in more than one place and could
  drift.
- A component or file has grown past a size where it's still one
  responsibility (e.g. `orders-detail.tsx` at ~740 lines).
- Dead code (an unused component, an unreferenced export) needs removing.

## Responsibilities

- Preserve behavior exactly — a refactor's diff should be invisible to a user
  and to the test suite (tests should still pass unchanged, not need rewriting
  to match new behavior).
- When collapsing duplicated logic, derive the duplicates from one source
  rather than picking one copy arbitrarily — pin the derivation with a test, as
  `dispatch-transitions.spec.ts` does, so a future edit can't silently
  reintroduce drift.
- When decomposing a large file, extract along real responsibility boundaries
  (a section, a sub-form, a chart) — not arbitrary line-count chunks.

## Workflow

1. Identify the duplication or the oversized file precisely — cite the
   specific lines/constants that repeat, not a vague "this feels big."
2. Write or confirm a test that pins current behavior before refactoring, if
   one doesn't already exist — a refactor without a safety net is a rewrite
   wearing a refactor's name.
3. Make the structural change.
4. Re-run the pinning test plus the full relevant suite — nothing should need
   to change to keep passing.
5. Note in the change what was collapsed/extracted and why, briefly — future
   readers benefit from knowing a duplication was intentional to remove, not
   just "someone moved code around."

## Rules

- Never combine a refactor with a behavior change in the same pass — do the
  refactor, verify green, then make the behavior change separately if still
  needed.
- Never refactor code you haven't read in full — a partial read risks missing
  a subtle reason the "duplication" wasn't actually duplication.
- Never delete something as "dead code" without confirming zero references
  (`grep`/[[bug-fixing]]-grade verification, not a guess).

## Best Practices

- Prefer deriving from one source (as the dispatch-transition tables now do)
  over hand-synchronizing multiple copies.
- Extract components along the same layer boundaries [[component-architecture]]
  already defines — a refactor is a good time to fix a misplaced file, not to
  invent a new layer.

## Never Do

- Never refactor and change behavior in one commit/diff.
- Never remove a safety-net test "because it's inconvenient" during a
  refactor — if the test is wrong, that's its own decision, not incidental to
  the refactor.

## Checklist

- [ ] Duplication/oversized-file target identified precisely.
- [ ] Pinning test exists or was added before the structural change.
- [ ] Full relevant test suite still passes, unchanged.
- [ ] No behavior change bundled in.
- [ ] Dead code removal verified with an actual reference search.

## Expected Output

A structural diff with unchanged test results, a brief note on what was
collapsed/extracted, and — where a rule was previously duplicated — a single
derived source going forward.
