---
name: testing-qa
description: Owns FlowERP's test strategy across vitest (apps/web unit), jest e2e-spec (apps/api), and Playwright (apps/web/e2e, including the rc-*.spec.ts release-candidate gate). Use when adding/fixing tests or deciding what level a new test belongs at.
---

# Testing & QA

## Purpose

FlowERP tests at three levels: `apps/web` unit tests (vitest — `*.test.ts`,
colocated with source, e.g. `board-columns.test.ts`), `apps/api` e2e specs
(jest, `*.e2e-spec.ts` under `apps/api/test/`), and browser e2e (Playwright,
`apps/web/e2e/*.spec.ts`), including an `rc-*.spec.ts` release-candidate gate
(`rc-auth`, `rc-golden-path`, `rc-integrity`, `rc-responsive`, `rc-roles`) that
exercises real cross-cutting flows and must stay green before anything ships.

## When to Use

- Adding a test for new/changed behavior.
- A test is failing and needs fixing (see [[bug-fixing]] for the diagnosis
  discipline first).
- Deciding whether something needs a unit test, an API e2e test, a browser
  e2e test, or more than one.

## Responsibilities

- Pin real invariants, not implementation details — e.g.
  `dispatch-transitions.spec.ts` pins the *derived* transition tables against
  the original hand-written values, so a mutation that reorders the chain goes
  red, rather than asserting on incidental internals.
- Keep the RC suites walking server-declared state (e.g. `allowedTransitions`)
  rather than hardcoding a status chain in the test itself — see TD-008/TD-009
  in `TECHNICAL_DEBT.md` for what happened when a test hardcoded a chain that
  the server later changed.
- Unit-test pure logic (`board-columns.ts`, `describe-error.ts`,
  `invalidate.ts`) with vitest; test cross-service flows (assignment policy,
  dispatch invariants, driver-dispatch flow) with API e2e specs; test full
  user journeys (sign-in, golden path, role-based nav) with Playwright.

## Workflow

1. Decide the right level: pure function/hook → vitest; multi-service backend
   flow → `*.e2e-spec.ts`; real browser journey spanning multiple screens →
   Playwright.
2. Write the test to assert the actual rule/invariant (e.g. "the retry policy
   does NOT retry a 409, and DOES retry a 500" — `describe-error.test.ts`), not
   an incidental detail that'll break on any refactor.
3. For anything touching the dispatch/order transition graph, re-run
   `board-columns.test.ts`, the relevant `*.e2e-spec.ts` files, and the
   `rc-*.spec.ts` suite — these are specifically designed to catch drift here.
4. Run the full relevant suite before calling a change done:
   `npm run test` / `npm run typecheck` / `npm run lint` in `apps/web`; the
   jest suite in `apps/api`; Playwright for browser-level changes.

## Rules

- Never hardcode a business rule (a status chain, a role list) inside a test
  that already exists as server-declared data — walk the real
  `allowedTransitions`/role config instead, so the test can't silently drift
  from the rule it's meant to guard.
- Never skip or comment out a failing test to "come back to it later" without
  flagging it explicitly.
- Never delete a regression test without understanding why it was added.

## Best Practices

- Prefer one test that pins a derived value against its source (as
  `dispatch-transitions.spec.ts` does) over several tests that each assert a
  hardcoded expectation which could drift independently.
- Keep the RC suite's scope in mind (auth, golden path, integrity, responsive,
  roles) when adding a new cross-cutting flow — it may belong there rather
  than in a one-off spec.

## Never Do

- Never mock away the exact invariant a test exists to guard.
- Never leave a new feature with zero test coverage at any level when the
  feature touches a shared invariant (roles, transitions, money).

## Checklist

- [ ] Correct test level chosen for what's being verified.
- [ ] Test asserts the real rule/invariant, not an incidental detail.
- [ ] Relevant `*.e2e-spec.ts` / RC suite re-run for transition/role changes.
- [ ] Full test/typecheck/lint pass before calling the change done.

## Expected Output

Tests that pin real invariants at the right level, passing alongside the full
existing suite, with the RC gate still green for anything touching a
cross-cutting flow.
