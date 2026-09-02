---
name: code-review-standards
description: FlowERP-specific code review standards layered on top of the general /code-review command — what "correct" means for this app's invariants (role guards, ADR-001 projection, shared-component reuse). Use alongside /code-review when reviewing a FlowERP diff.
---

# Code Review (FlowERP Standards)

## Purpose

Complements the built-in `/code-review` command with FlowERP-specific things a
generic reviewer wouldn't know to check: role-guard parity, the Dispatch/Order
projection invariant, shared-component reuse, and design-token discipline. Use
`/code-review` for general correctness/simplification; use this skill's
checklist for the project-specific invariants layered on top.

## When to Use

- Reviewing any PR/diff before merge.
- Self-reviewing before asking for sign-off.

## Responsibilities

- Catch violations of this app's specific, non-obvious invariants — the ones a
  generic reviewer (or a generic AI review) would pass right over because they
  look like ordinary code:
  - A new/changed endpoint's `@Roles(...)` list not mirrored in `nav-config.ts`.
  - A frontend write to order status that bypasses the Dispatch projection path
    (ADR-001 — see [[dispatch-board]], [[orders-module]]).
  - A hardcoded color/spacing value where a [[design-system]] token exists.
  - A hand-rolled loading/empty/error state where `list-states.tsx` should be
    used ([[component-architecture]]).
  - A duplicated role-list array instead of reuse of a named `*_ROLES` constant
    ([[auth-authorization]]).

## Workflow

1. Run `/code-review` first for general correctness/simplification/efficiency.
2. Then walk this skill's checklist specifically against the diff.
3. For any finding, cite the exact file/line and the specific rule violated
   (not "this looks off") — see [[bug-fixing]]'s standard for failure-scenario
   specificity.
4. Distinguish blocking findings (guard mismatch, projection violation, secret
   exposure) from suggestions (style, naming) — don't block a PR on the latter.

## Rules

- Never approve a diff that adds a nav-visible link without confirming the
  matching backend guard.
- Never approve a direct order-status write outside the dispatch/projection
  path.
- Never wave through a new hardcoded color/spacing value "because it's small."

## Best Practices

- Read the actual current files before reviewing — don't review against a
  remembered or assumed version of a file that may have changed.
- Prefer a short, concrete finding list over a long list of stylistic
  nitpicks; severity-order findings.

## Never Do

- Never rubber-stamp a diff you haven't actually read.
- Never let "the tests pass" substitute for checking the specific invariants
  above — a test suite doesn't know about `nav-config.ts` parity.

## Checklist

- [ ] Role guards (backend) and nav visibility (frontend) match exactly.
- [ ] No direct order-status writes outside the dispatch/projection path.
- [ ] No hardcoded colors/spacing where a token exists.
- [ ] Shared list/detail chrome reused, not duplicated.
- [ ] No duplicated role-list arrays.
- [ ] `/code-review` general pass also run.

## Expected Output

A findings list, most-severe first, each citing file/line and the specific
FlowERP invariant or convention violated — or confirmation that none were
found.
