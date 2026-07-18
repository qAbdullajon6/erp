---
name: release-checklist
description: The final gate before shipping a FlowERP change — ties together testing, security, accessibility, production-readiness, and documentation into one release sign-off. Use before merging/deploying anything non-trivial.
---

# Release Checklist

## Purpose

The last skill in the chain: confirms a change is actually ready to ship by
pulling together the other quality skills rather than re-deriving their
checks. This skill doesn't replace [[testing-qa]], [[security-review]],
[[accessibility-review]], or [[production-readiness]] — it confirms each was
actually done.

## When to Use

- Before merging a non-trivial PR.
- Before a production deployment.
- When asked "is this ready to ship?"

## Responsibilities

- Confirm, don't re-perform from scratch: check that [[testing-qa]]'s suites
  are green, [[code-review]]'s findings are resolved, [[security-review]]'s
  checklist was actually run for anything touching auth/guards/org-scoping,
  [[accessibility-review]] was applied to any new UI, and
  [[production-readiness]] concerns (env, migrations, health checks) are
  addressed for anything deploy-relevant.
- Confirm branch/git hygiene per [[git-workflow]] — correct base, no
  accidentally-included unrelated files, clear commit history.
- Confirm [[documentation]] is updated where the change is architecturally
  significant (a new module, a new invariant, a resolved technical debt entry).

## Workflow

1. Run the full test matrix: `npm run typecheck`, `npm run lint`, `npm run
   test` (vitest) in `apps/web`; the jest suite in `apps/api`; Playwright
   (including the `rc-*.spec.ts` gate) for anything touching a cross-cutting
   frontend flow.
2. Run a production build (`npm run build`) — a change that only passes `dev`
   but fails to build is not shippable.
3. Confirm [[code-review]] and, if relevant, [[security-review]] passes were
   actually done on this diff, not assumed clean.
4. Confirm [[database-migrations]] safety if the change includes a schema
   change — deploy-safety, not just "works locally."
5. Confirm `git status` is clean, the branch is based on a verified-current
   ref ([[git-workflow]]), and the commit history is scoped and readable.
6. State explicitly what was verified and what wasn't (e.g. "visual browser
   check not possible in this environment") rather than implying full
   coverage.

## Rules

- Never sign off on a release with a failing test, unresolved lint error, or
  broken build.
- Never claim a check was performed that wasn't actually run.
- Never skip the production build check because "dev works fine."

## Best Practices

- Prefer an honest partial sign-off ("typecheck/lint/tests/build all pass;
  visual browser verification wasn't possible in this environment") over an
  implied full green light.
- Keep the release note (if one is produced) focused on what changed and why,
  not a restatement of every file touched.

## Never Do

- Never merge/deploy with a known-failing check "to unblock" without explicit,
  informed sign-off from the user on that specific risk.
- Never treat this checklist as a formality once the other skills' work is
  actually done — it's the point where gaps get caught, not skipped.

## Checklist

- [ ] Typecheck, lint, and all relevant test suites pass.
- [ ] Production build succeeds.
- [ ] [[code-review]] findings resolved.
- [ ] [[security-review]] run for anything touching auth/guards/org-scoping.
- [ ] [[accessibility-review]] applied to any new UI.
- [ ] [[production-readiness]] concerns addressed for deploy-relevant changes.
- [ ] [[database-migrations]] safety confirmed if schema changed.
- [ ] Git history clean and based on a verified-current branch.
- [ ] Documentation updated where architecturally significant.

## Expected Output

An explicit, honest sign-off: a checklist of what was verified, what (if
anything) couldn't be verified in this environment, and a clear go/no-go —
never an implied "all good" without the checks behind it.
