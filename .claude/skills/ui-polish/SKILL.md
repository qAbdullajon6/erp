---
name: ui-polish
description: Small, targeted visual/UX fixes on a single screen or component — spacing, hover/focus states, empty states, micro-interactions. Use for scoped polish requests; use frontend-redesign instead for whole-module or whole-app overhauls.
---

# UI Polish

## Purpose

Handles small, well-scoped visual improvements — a spacing fix, a missing hover
state, an inconsistent skeleton, a misaligned card — without triggering the
planning overhead of [[frontend-redesign]]. This is the "fix this one thing well"
skill.

## When to Use

- A single component or screen has a specific, nameable visual issue.
- The user points at something concrete ("this card's padding looks off," "this
  button has no loading state," "empty state on this list is inconsistent").
- Not for: multi-module overhauls, new shared primitives, or app-shell changes —
  those go through [[frontend-redesign]].

## Responsibilities

- Fix the specific issue using existing [[design-system]] tokens and
  [[component-architecture]] shared primitives — never invent a one-off token or
  duplicate a shared component to fix a single instance.
- Keep the diff small and reviewable — a polish fix should be obviously safe to
  merge on its own.

## Workflow

1. Reproduce/locate the exact issue in the real file — read it before editing.
2. Check whether the fix is a token issue ([[design-system]]), a missing shared
   primitive usage ([[component-architecture]] — e.g. this screen should be using
   `list-states.tsx` but hand-rolled its own spinner), or a genuinely local tweak.
3. Make the minimal change that fixes the stated issue. Don't restyle the whole
   component while you're in there.
4. Check the same pattern elsewhere — if `metric-card.tsx` has an inconsistent
   skeleton, check whether other cards in the same module have the same issue
   before calling it done, but don't expand into a full module pass uninvited.
5. Verify: typecheck, lint, and (if a browser tool is available) a visual check
   of the changed screen at both desktop and mobile widths.

## Rules

- Never touch business logic, data fetching, or API calls for a polish task.
- Never introduce a new shared component for a single-use fix — extract to
  `shared/` only once a second real consumer exists.
- Never expand a "fix this button" request into a component rewrite without
  flagging the larger issue and asking first.

## Best Practices

- Use existing hover/focus/transition conventions already in the codebase
  (`transition-colors`, `hover:bg-brand/10`, `focus-visible:ring-1
  focus-visible:ring-ring`) rather than inventing new easing/duration values.
- Prefer Tailwind utility composition over new CSS.
- When fixing a loading/empty/error state, always reach for
  `components/shared/list-states.tsx` first.

## Never Do

- Never "clean up while I'm here" beyond the stated scope.
- Never hardcode a color or spacing value that a token already covers.
- Never fix the same visual bug differently in two places — use the shared fix.

## Checklist

- [ ] Exact issue identified and reproduced before editing.
- [ ] Fix uses existing tokens/primitives, no new one-offs.
- [ ] Diff is scoped to the stated issue.
- [ ] Typecheck/lint clean.
- [ ] Visual check done at desktop + mobile widths, or explicitly flagged as
      not possible.

## Expected Output

A small, focused diff (typically 1-3 files) that fixes exactly what was asked,
plus a one-line note if the same issue was spotted elsewhere and intentionally
left out of scope.
