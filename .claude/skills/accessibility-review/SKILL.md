---
name: accessibility-review
description: Audits and enforces accessibility across FlowERP's frontend — color-alone signaling, keyboard navigation, reduced-motion, screen-reader announcements. Use when reviewing a screen for a11y, or when building anything status/color/motion/drag related.
---

# Accessibility Review

## Purpose

FlowERP already holds itself to a real accessibility standard in places — this
skill keeps every new screen at that same bar rather than letting it slip
per-module. Concrete precedent already exists in the codebase; match it, don't
reinvent a lower standard.

## When to Use

- Reviewing any screen that signals status/meaning through color.
- Building anything with drag-and-drop, custom keyboard interaction, or a
  live-updating region.
- Auditing contrast, focus order, or motion behavior.

## Responsibilities

- **Never color alone.** `kpi-cards.tsx`'s `TONE_STYLES` pairs every
  good/warning/neutral tone with both a text color and a `LucideIcon` — "so the
  meaning survives colour-blindness and forced-colours mode" (the file's own
  comment). Match this for any new status/tone signal.
- **Validated categorical colors.** `--series-revenue`/`--series-expenses` in
  `styles.css` are documented as separating by a specific ΔE under protanopia,
  verified with a palette validator — not eyeballed. Any new multi-series chart
  color pair should meet the same bar, not just "look different to me."
  See [[design-system]].
- **Reduced motion respected.** `styles.css` already honors
  `prefers-reduced-motion: reduce` for scroll behavior — any new animation
  (transitions, drag feedback) should check this media query too, not just the
  one place it's currently applied.
- **Screen-reader announcements for async state changes.** The dispatch board
  announces drag-and-drop moves politely after they settle (`announcement`
  state in `dispatch-board.tsx`) — any other async-completing interaction
  (a form submit, a status change) should consider whether a screen-reader user
  gets equivalent feedback to what a sighted user sees.
- **Keyboard parity for drag interactions.** The dispatch board wires both
  `PointerSensor` and `KeyboardSensor` — any new drag-and-drop interaction must
  support keyboard operation, not just pointer/touch.

## Workflow

1. For any new status/tone indicator, pair it with an icon or text label —
   never ship a color-only dot/badge for meaning.
2. For any new chart with 2+ series, verify the color pair is distinguishable
   under common color-vision deficiencies before shipping — don't assume
   "blue vs. orange" is automatically safe.
3. For any new animation/transition, check it against
   `prefers-reduced-motion` alongside the existing convention in `styles.css`.
4. For any new drag-and-drop or custom-keyboard widget, verify it's operable
   by keyboard alone, and add a screen-reader announcement for the outcome.
5. Check focus order and visible focus rings (`focus-visible:ring-1
   focus-visible:ring-ring` is the established pattern) on any new interactive
   element.

## Rules

- Never ship a status indicator that relies on color alone.
- Never introduce a new chart color pair without checking color-vision-
  deficiency separation.
- Never build a drag-and-drop interaction without keyboard support.
- Never ignore `prefers-reduced-motion` on a new animation.

## Best Practices

- Reuse `TONE_STYLES`-style tone+icon pairing as the default pattern for any
  new status signal, rather than inventing a new convention per screen.
- Use `sr-only` labeling (already used e.g. for `SheetTitle` in mobile nav)
  for elements that are visually implicit but need an explicit accessible name.

## Never Do

- Never remove an existing screen-reader announcement or `aria-label` while
  touching a component for an unrelated reason.
- Never assume a color pair is distinguishable without checking.

## Checklist

- [ ] Status/tone signals paired with icon or text, not color alone.
- [ ] New chart colors checked for color-vision-deficiency separation.
- [ ] New animations respect `prefers-reduced-motion`.
- [ ] Drag-and-drop or custom-keyboard widgets operable via keyboard.
- [ ] Focus rings and screen-reader announcements present for new interactive
      elements.

## Expected Output

A screen or component that matches the accessibility bar this app already
sets elsewhere — tone+icon pairing, validated chart colors, reduced-motion
respect, and keyboard/screen-reader parity for any custom interaction.
