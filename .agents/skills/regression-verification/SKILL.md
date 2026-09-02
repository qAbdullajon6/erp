---
name: regression-verification
description: Live, in-browser verification pass — routing, navigation, active state, loading/empty states, responsive, console errors, accessibility. Run this after any structural change (AppShell/nav/route migration) and before starting the next module's premium redesign. Distinguishes real frontend regressions from expected backend-not-ported gaps.
---

# Regression Verification

## Purpose

Build/typecheck/lint/test passing proves the code compiles and existing unit
tests still hold — it proves nothing about whether a page actually renders,
whether the sidebar highlights the right item, or whether a drawer opens on
mobile. This skill is the live-browser check that closes that gap. Run it
after any change to shared chrome (AppShell, nav-config, sidebar, topbar,
command palette) or after restoring/migrating a batch of routes — before
starting the next module's [[frontend-redesign]] pass.

## When to Use

- After an AppShell/navigation/routing structural change.
- After restoring or merging in a batch of routes (e.g. from a stash/branch
  migration) — new routes existing and typechecking is not the same as them
  rendering correctly.
- Before starting premium redesign work on the next module, as the gate that
  confirms the current state is a stable base to build on.

## Responsibilities

- Drive the real app in a browser (not just read the code) and check, per
  route: does it load, does the sidebar show the right active item, does the
  breadcrumb match, is there a loading state before data arrives, an empty
  state when a list is genuinely empty, no console errors/warnings that
  weren't there before, and does it still work at mobile width (drawer nav)
  and with the sidebar collapsed.
- Separate two failure classes precisely:
  1. **Real frontend regression** — something that broke because of a
     shell/nav/routing change (e.g. the sidebar doesn't highlight the current
     page, a route 404s that shouldn't, a drawer doesn't close after
     navigating, a console error from the shell itself).
  2. **Expected backend gap** — a screen shows an error/empty state because
     its backend module hasn't been ported yet (see [[git-workflow]]'s
     stash-migration audits). This is NOT a regression; do not report it as
     one, and do not attempt to fix it by faking data or suppressing the
     error state.
- If no browser automation tool is available in the environment, say so
  explicitly and report exactly what was and wasn't verified — never imply a
  live check happened when it didn't.

## Workflow

1. Get the current route list (`routes/*.tsx`, file-based) and the current
   `nav-config.ts` — these define what "every page" means for this pass.
2. For each nav-visible route (and a sample of non-nav routes: detail/create
   pages): navigate to it, screenshot or read the accessibility tree, and
   check the specific list in Responsibilities above.
3. Toggle the sidebar (expanded/collapsed) and resize to a mobile width to
   check the drawer — do this once per shell change, not per individual page,
   since it's shell behavior, not page behavior.
4. Open the command palette (⌘K) and click through a couple of entries — this
   is shared chrome, check it once.
5. Read browser console output per page (or per navigation) filtered for
   errors/warnings; note any that are new versus pre-existing.
6. For any failure, classify it (real regression vs. expected backend gap)
   before reporting — an unclassified "this page shows an error" is not a
   useful finding.
7. Fix only real frontend regressions found this way. Expected backend gaps
   get listed, not "fixed" (no faking data, no swallowing the error state).

## Rules

- Never claim a live verification happened without an actual browser tool
  connected — if unavailable, say exactly that and fall back to static
  checks (route tree, nav-config coverage), labeled as such.
- Never report a backend-dependent empty/error state as a frontend
  regression — check [[git-workflow]]'s own audit trail for which modules
  are known to be backend-less before concluding something is broken.
- Never "fix" a backend gap by mocking data in the component — that hides the
  real state rather than reporting it.

## Best Practices

- Batch shell-level checks (sidebar collapse, mobile drawer, command palette,
  breadcrumb) once per structural change rather than re-testing them on every
  single page — they're shared chrome, not per-page behavior.
- Prioritize nav-visible routes first (what a real user actually reaches via
  the sidebar), then spot-check detail/create routes reachable by click-through.
- Keep a running list of "known backend gap" screens so repeat verification
  passes don't re-flag the same expected gaps every time.

## Never Do

- Never skip this pass "because the build passed" — that's exactly the gap
  this skill exists to close.
- Never conflate a backend-not-ported gap with a real bug in the report.
- Never fabricate screenshot/console evidence — if you didn't check it, say so.

## Checklist

- [ ] Every nav-visible route opened and checked (loads, active state,
      breadcrumb, loading/empty state, console clean).
- [ ] Sidebar collapse/expand checked once.
- [ ] Mobile-width drawer nav checked once.
- [ ] Command palette checked once.
- [ ] Every finding classified as real regression or expected backend gap.
- [ ] Only real regressions get fixed; backend gaps are listed, not faked.
- [ ] If no browser tool was available, explicitly stated — not implied away.

## Expected Output

A per-route pass/fail table (or a clear "not verifiable in this environment"
statement), a short list of real frontend regressions (fixed, with what
changed), and a separate list of expected backend-gap screens left as-is —
never a single undifferentiated "some things don't work" summary.
