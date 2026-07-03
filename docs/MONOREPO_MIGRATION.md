# Monorepo Migration

This repository was restructured from a single Next.js app at the repo root
into a minimal monorepo, in preparation for a future backend without
disturbing the existing frontend, its Git history, or its GitHub remote.

## What moved

- The entire Next.js app (`src/`, `public/`, `next.config.ts`, `tsconfig.json`,
  `eslint.config.mjs`, `components.json`, `postcss.config.mjs`, `package.json`)
  moved from the repo root into `apps/web/`, via `git mv` so history is preserved.
- `DEMO_SCRIPT.md` moved into `docs/DEMO_SCRIPT.md`.
- The root `package.json` was replaced with a minimal npm **workspaces** root
  (`"workspaces": ["apps/*", "packages/*"]`) with no application dependencies
  of its own — all real dependencies still live in `apps/web/package.json`,
  unchanged.
- `packages/ui` and `packages/types` were added as **empty placeholders only**
  (a `package.json` and a short README each) — no components or types were
  migrated into them. `apps/web` still owns all of its own UI and types
  directly, exactly as before.
- `.gitignore` patterns for `node_modules`/`.next`/`out`/`build` were
  unanchored (leading `/` removed) so they match at any depth in the new
  per-workspace layout, not just the repo root.

Nothing in `apps/web`'s application code changed: routes, UI, role
permissions, the `localStorage`-backed data store, and the demo AI Assistant
are all byte-for-byte the same as before this migration — this was a pure
file-location and tooling change, verified with `tsc`, `eslint`, `next build`,
and a fresh dev-server pass across every route.

## How to run the frontend locally

From the repository root (npm workspaces forwards each script to `apps/web`):

```bash
npm install
npm run dev         # http://localhost:3000
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm run build        # next build
npm run start        # next start (after build)
```

Running these same commands directly inside `apps/web` also still works.

## Why backend work is intentionally deferred

This phase is scoped to the frontend relocation and monorepo foundation only.
No backend, database, ORM, or authentication was introduced here — building
those requires its own dedicated phase (data model, auth, multi-tenancy) with
its own review, rather than being bundled into a file-restructuring change.
The frontend keeps using its existing `localStorage`-backed demo store
untouched until that backend phase begins.

## Planned future location

A future backend phase would add a new `apps/api` workspace alongside
`apps/web` (e.g. a NestJS + PostgreSQL + Prisma service), with `packages/types`
starting to hold domain types shared between `apps/web` and `apps/api`, and
`packages/ui` starting to hold shared UI components if a second frontend
surface is ever added. None of that exists yet — these are placeholders only.

## Vercel deployment note

No deployment was performed as part of this phase. Because the Next.js app
now lives in `apps/web` instead of the repo root, the Vercel project's
**Root Directory** setting needs to be changed from `.` to `apps/web` before
the next deployment (Project Settings → General → Root Directory, in the
Vercel dashboard). No `vercel.json` was added — this is the officially
recommended approach for a Next.js app inside a monorepo subdirectory.
