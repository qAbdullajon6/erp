---
name: performance-optimization
description: Diagnoses and fixes real performance issues in FlowERP — unnecessary re-renders, over-fetching, unbounded queries, N+1s. Use only against a measured problem; not a substitute for profiling.
---

# Performance Optimization

## Purpose

Fixes measured performance problems on both tiers: frontend re-render/bundle
issues and backend query/N+1 issues. This skill starts from a symptom or a
profile, not a hunch — "this might be slow" is a hypothesis to verify, not a
license to add memoization everywhere.

## When to Use

- A specific screen or interaction is reported/observed as slow.
- A backend endpoint's query plan or response time needs investigating.
- Reviewing whether a re-render or over-fetch pattern is actually a problem
  before "optimizing" it.

## Responsibilities

- Diagnose before changing anything — identify whether the bottleneck is
  render count, query shape, network waterfall, or bundle size.
- Frontend: check for missing `React.memo`/`useMemo`/`useCallback` only where a
  render is proven expensive and proven frequent — see `DispatchCard`
  (`components/dispatch/dispatch-card.tsx`) for an existing example of a
  `memo`-wrapped card on a screen with many frequently-updating siblings
  (the dispatch board).
- Backend: check for N+1 Prisma queries (missing `include`, loop-per-row
  queries) and missing indexes before assuming application logic is the
  problem.
- Query/list screens: verify [[api-integration]]'s query keys and `staleTime`
  aren't causing redundant refetches, and that list endpoints are actually
  paginated where they should be (the dispatch board is a deliberate,
  documented exception — see [[dispatch-board]]'s `BOARD_PAGE_SIZE`).

## Workflow

1. Reproduce and measure first — React DevTools profiler for render issues,
   Prisma query logging / `EXPLAIN ANALYZE` for backend query issues, network
   tab for over-fetching.
2. Identify the specific cause (not "this component is slow" but "this
   component re-renders on every keystroke in an unrelated sibling because it
   isn't memoized against that prop").
3. Apply the minimal fix — a targeted `memo`/`useMemo`, an `include` clause, an
   index, a query-key correction — not a broad rewrite.
4. Re-measure to confirm the fix actually helped; a "performance fix" that
   doesn't move the measured number isn't done.

## Rules

- Never add `useMemo`/`useCallback`/`React.memo` without a measured reason —
  premature memoization adds complexity and can itself cause bugs (stale
  closures) for no benefit.
- Never optimize a query without checking the Prisma query log or an EXPLAIN
  plan first.
- Never turn a paginated list into a full-fetch (or vice versa) without
  checking whether the screen's actual use case (a bounded operational board
  vs. an arbitrarily large historical list) matches.

## Best Practices

- Prefer fixing the query shape (correct `include`, avoiding N+1) over adding
  application-level caching to paper over a bad query.
- Prefer code-splitting/lazy-loading a genuinely large, rarely-used route over
  shrinking shared bundle code that many routes need.

## Never Do

- Never ship a performance change without a before/after measurement.
- Never sacrifice correctness (e.g. dropping a role check, skipping
  validation) for speed.

## Checklist

- [ ] Problem measured/profiled before any change.
- [ ] Root cause identified specifically (render/query/bundle/network).
- [ ] Fix is targeted, not a broad speculative rewrite.
- [ ] Improvement re-measured and confirmed.
- [ ] No correctness/security trade-off introduced.

## Expected Output

A targeted fix with a before/after measurement showing the specific problem
resolved, and no unrelated speculative optimization bundled in.
