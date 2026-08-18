# FlowERP Landing — Design System

FlowERP AI is a **logistics operations platform**: orders, dispatch, fleet, tracking and
finance in one workspace, with an AI assistant across all of it. The landing page's job is
to make that legible in about five seconds and then get out of the way.

Quality here comes from **typography, spacing, hierarchy, and motion** — not decoration.
Every section composes the primitives in `primitives.tsx` and the motion layer in
`motion.tsx`. No section re-invents these.

## The one non-negotiable rule: nothing invented

The page previously carried a "Live operations" panel (orders in flight, fleet active,
on-time rate), named customer testimonials, a customer logo marquee, and an implementation
timeline — none of it real. It is all gone, and it does not come back. Anything that reads
as a number, a customer, a result, or a commitment has to be something we can stand behind.

In practice:

- **No metrics** on the page, animated or otherwise. `CountUp` was removed with them.
- **No customers, logos or quotes** until there are real ones with permission to use them.
- **Feature claims must have repository evidence.** `Capabilities.tsx` describes what the
  modules do, in an operator's words, not what they achieve.
- The product visual (`ProductPreview.tsx`) is plainly the *shape* of a screen — an order
  number, a route, a status — rendered with the app's own `StatusBadge`. It is labelled a
  preview, not dressed with a "Live" indicator.
- **No pricing** is shown, and there is no pricing page, so the header does not link to one
  and the structured data carries no `offers`. The single conversion path is the demo modal.

Shared tokens live in `styles.css` (dark navy, one brand hue `--brand = oklch(0.68 0.17 250)`,
`--radius = 0.75rem`). We **do not** change shared tokens — the whole app depends on them.
The landing-only ambient/motion utilities are prefixed `lv2-` and defined in `styles.css`.

## 1. Colour — one hue, used as a scalpel

- Page `bg-background` (navy). Cards `bg-surface`. Elevated surfaces are rare.
- **Brand** is allowed only on: primary CTA, links, eyebrows, focus rings, active/live
  states, `bg-brand/10` icon tiles, and thin accent lines (network/route). One accent
  word in the hero H1. Nothing else.
- Borders: one — `border-border`. Interactive hover brightens to `border-brand/40`.
- Status: `success` for live/on-time, `destructive` only in a genuine "before" contrast.
- **Banned as decoration:** gradient fills, glow orbs, `blur-3xl`, colour proliferation.
  The single allowed ambient is one soft brand wash (`lv2-wash`) and a barely-there,
  always-masked grid (`lv2-grid`).

## 2. Typography — `font-display` = Manrope, body = Inter

- Hero H1: `text-[2.6rem] sm:text-6xl lg:text-7xl font-semibold tracking-tight leading-[1.05]`.
- Section H2: `text-3xl sm:text-4xl lg:text-[2.75rem] font-semibold tracking-tight`.
- Card H3: `text-base`/`text-lg font-semibold`.
- Lead: `text-lg leading-relaxed text-muted-foreground` (≈`max-w-2xl`).
- Body: `text-sm`/`text-base text-muted-foreground`. Numerals: `tabular-nums`.
- **Weight ceiling is `font-semibold` (600).** Bold reads heavy; premium type is semibold.

## 3. Spacing & grid (8px rhythm)

- Section padding: **`py-24 sm:py-32`** (the only section rhythm).
- Container: `Container` — `max-w-6xl` default, `max-w-7xl` (`wide`), `max-w-3xl` (`narrow`).
- Gutter `px-6`. Header→content `mt-14`/`mt-16`. Card padding `p-6`/`p-7`/`p-8`.
- Grids step `1 → 2 → 3/4`; card gaps `gap-4`/`gap-6`.

## 4. Radius & elevation

- Cards `rounded-xl` (12px). Large frames/CTA band `rounded-2xl` (16px) max. Icon tiles
  `rounded-lg`. Buttons/inputs primitive default. **No `rounded-3xl`.**
- Elevation on navy = **border + subtle surface lift**, not big shadows. Rest: border only.
  Hover: `border-brand/40` + `-translate-y-0.5` (150–200ms). `shadow-lg/xl` + `backdrop-blur`
  only on overlays (scrolled nav, modal, floating chips, product frame).

## 5. Buttons

- Primary: **solid** `bg-brand text-brand-foreground hover:bg-brand/90`, height `h-11`/`h-12`.
  (Button `default` variant already maps to the brand.) **One primary CTA per section.**
- Secondary: `variant="outline"` on `bg-surface`. Tertiary: quiet brand text link + `ArrowRight`.
- No gradient buttons.

## 6. Cards, tiles, pills

- `Card`: `rounded-xl border border-border bg-surface`; `interactive` adds the one hover.
- `IconTile`: `rounded-lg bg-brand/10 text-brand ring-1 ring-inset ring-brand/15`, `h-11`/`h-9`.
- `Pill` (muted/brand/success) for status. Statuses inside a product visual use the app's
  real `StatusBadge`, so a status is the same colour here as it is inside the product.
- `BrowserFrame` wraps every product visual in one consistent window chrome. Its `live`
  prop defaults off — there is no live data behind these.

## 7. Inputs

Auth and the demo modal share one treatment via `AUTH_INPUT_CLASSES` (`h-11`,
`bg-background/40`, `rounded-lg`): size and surface only. **Focus and invalid states come
from the shared `ui/input` primitive**, so fixing a focus ring once fixes it everywhere
rather than only on the marketing site.

## 8. Icons

Lucide only. `h-5 w-5` default, `h-4 w-4`/`h-3.5 w-3.5` inline. One accent-tile convention.

## 9. Motion (`motion.tsx` + `lv2-` keyframes)

- **One entrance, and only one:** `<Reveal>` — fade + rise, easing `cubic-bezier(0.16,1,0.3,1)`
  ~700ms, staggered by `delay`. IntersectionObserver-driven, opt-in. It takes an optional
  `id` so a revealed block can also be an in-page anchor target.
- Because every section starts at `opacity: 0`, a failed observer would silently ship blank
  bands. `public-responsive.spec.ts` scrolls the page and asserts each section's heading
  actually reaches `opacity: 1`.
- Micro-interactions: 150ms on colour/border/transform.
- **Everything decorative is disabled under `prefers-reduced-motion`** (hooks return the
  final state; `lv2-*` animations are switched off in a media block in `styles.css`).

## 10. Responsive & a11y

Mobile-first (`sm`/`md`/`lg`). Type steps down one level on mobile; floating chips and the
long announcement copy collapse. Every interactive element has a `focus-visible` ring and a
≥44px touch target. Hover changes colour/border — never layout. Product visuals are
`aria-hidden`; the copy carries the meaning.

## Section order

`Nav → Hero → ProductPreview → Capabilities → HowItWorks → Closing (CTA) → Footer`.

Four content sections, each with one job: what it is, what it looks like, what it does, how
you start. The header links only to what exists on the page — `#product`, `#capabilities`,
`#how-it-works`. Shared conversion infra (`DemoModal`, `openDemoModal`, analytics, SEO) is
reused, not rebuilt.

## The bottom of a phone screen is contested

Three things want `bottom-0` on mobile: the consent banner (`z-[60]`), the sticky
`MobileCTA` (`z-40`), and the mobile nav sheet's own CTA. Two of them have already been
found invisible on a first visit, buried under the banner. `MobileCTA` now subscribes to
`subscribeConsentBanner` and stands down until the visitor has chosen, and the sheet's CTA
sits up with the nav links rather than pinned to the bottom. Both are covered by
`public-responsive.spec.ts`, which probes with `elementFromPoint` — being *visible* is not
enough when something else is painted on top.
