---
name: design-system
description: Owns FlowERP's design tokens, typography, and primitive component contracts (Tailwind v4 + shadcn/ui, "new-york" style). Use when adding/changing a color, spacing scale, radius, font, or a ui/ primitive itself — not when consuming existing tokens in a feature screen.
---

# Design System

## Purpose

FlowERP's visual identity lives in exactly two places: `apps/web/src/styles.css`
(design tokens, Tailwind v4 `@theme inline` block) and `apps/web/src/components/ui/*`
(shadcn primitives, "new-york" style, slate base — see `apps/web/components.json`).
This skill owns both. Every other frontend skill consumes tokens and primitives;
none of them may invent new ones inline.

## When to Use

- Adding, renaming, or retuning a CSS custom property in `styles.css`.
- Adding a new variant to an existing `ui/` primitive (e.g. a new `Badge` tone).
- Introducing a genuinely new primitive that doesn't exist in `ui/` yet and is needed
  by more than one module (a one-off belongs in the feature's own component, not here).
- Auditing contrast, dark-mode consistency, or token drift across the app.

Do NOT use this skill to style a single page — that's [[ui-polish]] or the
relevant module skill, and it must consume tokens, never hardcode colors.

## Responsibilities

- The single source of truth for color, radius, spacing rhythm, and type scale.
- Keep `--background/--surface/--surface-elevated/--card` as a coherent elevation
  ladder (currently an oklch dark-navy identity — this app is dark-first, single
  theme; there is no `.dart` light override and none should be added without an
  explicit product decision).
- Keep semantic tokens semantic: `--success`/`--warning`/`--destructive` mean status,
  never reuse them for a plain data series. `--series-revenue`/`--series-expenses`
  exist precisely so a chart's categorical colors don't collide with status colors.
- Own the shadcn primitives in `ui/` (button, card, table, badge, sidebar, command,
  breadcrumb, chart, dialog, sheet, etc.) — extend via `cva` variants, never fork.

## Workflow

1. Before adding a token, check `styles.css`'s `@theme inline` block and `:root` —
   most needs (another status tone, another chart color) already have a home.
2. New color tokens are defined in oklch, in the `:root` block, then mapped through
   `@theme inline` as `--color-x: var(--x)` so Tailwind utilities (`bg-x`, `text-x`)
   pick them up.
3. When extending a primitive (e.g. `badge.tsx`), add a `cva` variant — see the
   existing `success`/`warning`/`muted`/`brand`/`danger` badge variants for the
   pattern. Never add a one-off `className` override at the call site for something
   that will recur.
4. Validate categorical/chart colors for color-vision-deficiency separation before
   shipping them (see the ΔE-under-protanopia comment above `--series-revenue` in
   `styles.css` for the standard this app already holds itself to).
5. Run the app in dark background and check every changed token against WCAG AA
   for both text-on-background and text-on-surface-elevated.

## Rules

- Never hardcode a hex/rgb color in a component. If a token doesn't exist yet, add
  it here first.
- Never introduce a second styling system (no CSS modules, no styled-components,
  no inline `style={{ color: '#...' }}` for anything expressible as a token).
- Never fork a `ui/` primitive into a feature folder. Extend it in place.
- Respect the existing radius scale (`--radius` and its derived `sm/md/lg/xl/2xl/3xl`)
  — don't invent a one-off `rounded-[14px]`.

## Best Practices

- Prefer extending an existing token's *usage* over adding a new token — most
  "we need a new color" requests are actually "we need `--brand` at a different
  opacity," which Tailwind's `/NN` opacity modifiers already solve.
- Keep the type scale limited: `font-sans` (Inter) for body/data, `font-display`
  (Manrope) for headings only — don't mix mid-paragraph.
- When a primitive needs a genuinely new visual treatment used by 2+ modules,
  it belongs in `ui/`, not duplicated per-module.

## Never Do

- Never change `--primary`/`--brand` without checking every consumer (buttons,
  focus rings, sidebar active state, gradient utilities) — it is the single most
  load-bearing token in the app.
- Never remove or repurpose `--success`/`--warning`/`--destructive` semantics.
- Never add a light theme "just in case" — this is a deliberate dark-first product
  decision, not an oversight.

## Checklist

- [ ] Token added in oklch, in `:root`, following the existing naming convention.
- [ ] Token exposed via `@theme inline` if it needs a Tailwind utility.
- [ ] Existing primitives re-checked for regressions (sidebar, buttons, badges).
- [ ] Contrast checked against both `--background` and `--surface-elevated`.
- [ ] No hardcoded colors introduced anywhere in the diff.
- [ ] `npm run typecheck` and `npm run lint` clean in `apps/web`.

## Expected Output

A token or primitive change confined to `styles.css` and/or `components/ui/*`,
with every consuming component updated to use the token (not a parallel literal
value), and a one-line note on which components were visually re-verified.
