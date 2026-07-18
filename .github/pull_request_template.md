<!-- FlowERP AI — PR template. Keep it short and honest. -->

## What & why

<!-- One paragraph: what this changes and the reason. Link the issue/ADR if any. -->

## Scope

- [ ] No architecture redesign / no rewrite of a working module (or: explained below)
- [ ] Role guards (backend `@Roles`) and nav visibility (`nav-config.ts`) stay in sync
- [ ] No direct order-status write outside the Dispatch projection path (ADR-001)
- [ ] Design tokens used — no hardcoded colors/spacing

## Migrations

- [ ] No schema change, **or** the migration is additive / backward-compatible
- [ ] Destructive change (if any) is staged across two deploys (add → backfill → constrain)

## Verification

<!-- What you actually ran. CI covers web typecheck/lint/unit/build, API build,
     migration apply, and the Docker image build. Note anything you checked by hand. -->

- [ ] CI green (or the only red is the known non-blocking API test-spec debt)
- [ ] Verified the affected flow end-to-end (not just tests)

## Deploy notes

<!-- Anything the deployer must know: new required env var, one-off command, order. -->
