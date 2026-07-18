---
name: git-workflow
description: Branching, base-selection, and commit discipline for FlowERP's monorepo — including how to verify which branch actually has the current code before starting work. Use before starting any multi-file task and before any destructive git operation.
---

# Git Workflow & Branching

## Purpose

FlowERP is a monorepo (`apps/api`, `apps/web`) with active parallel work — this
skill exists because assuming "`main` is current" or "the checked-out branch is
safe to reset" has already caused real confusion in this project (a redesign
branch was once created off a stale `origin/main` that was missing several
merged-but-unpushed commits, including real frontend work). Verify, don't
assume.

## When to Use

- Before starting any task that will span multiple files or commits.
- Before creating a new branch for a large piece of work.
- Before any destructive git operation (`reset --hard`, `checkout --`, force
  push, branch deletion).

## Responsibilities

- Establish which ref actually has the current, complete code before branching
  from it — compare candidate bases with
  `git log --oneline A..B` / `git merge-base --is-ancestor A B`, don't assume
  `origin/main` is ahead of a local feature branch just because it's "main."
- Protect uncommitted work — before switching branches or resetting, check
  `git status`, and stash (`git stash push -u -m "<description>"`) rather than
  discard anything that isn't yours to lose.
- Verify a stash actually cleared the working tree after pushing it — a stash
  can partially fail (e.g. due to line-ending/permission issues) and leave
  tracked changes still dirty even though the stash object was created; compare
  the stash's diff against the residual working-tree diff before trusting
  either.
- Keep commits scoped: one logical change per commit, clear message, no
  unrelated files swept in by a broad `git add -A`.

## Workflow

1. Before branching for a new piece of work: identify every candidate base
   (`main`, `origin/main`, the active feature branch) and diff them —
   `git log --oneline <a>..<b>` both directions — to find which one is
   actually current. Prefer the base with the most complete, real code, even
   if that means branching from a feature branch rather than `main`.
2. Before switching branches: `git status`. If there are uncommitted changes
   that aren't part of the current task, stash them with a descriptive message
   rather than losing or carrying them into an unrelated branch.
3. After stashing: re-run `git status` and, if anything is unexpectedly still
   dirty, diff the residual working-tree changes against the stash's own diff
   to confirm nothing is at risk before proceeding (a partial stash failure is
   rare but has happened).
4. Create the new branch from the verified-correct base.
5. Commit in scoped, logical chunks with messages describing *why*, not just
   *what*.
6. Never rewrite history (`rebase`, `reset --hard`, force-push) on a branch
   without explicit confirmation that no one else depends on its current tip.

## Rules

- Never assume `main`/`origin/main` is current without checking — verify with
  `git log`/`merge-base`.
- Never run a destructive git command without a preceding `git status` and,
  if anything uncommitted exists, a stash or commit first.
- Never force-push to a shared branch without explicit, scoped authorization
  for that specific push.
- Never bundle unrelated work into one commit via a broad `git add -A` without
  reviewing what was actually staged.

## Best Practices

- Prefer `git stash push -u -m "<why>"` over `git checkout -- .`/`git clean`
  when clearing a working tree that might contain someone's in-progress work.
- Prefer creating a new branch over continuing on a branch that mixes unrelated
  concerns (e.g. a backend audit branch is not the place for a frontend
  redesign, even if it happens to be the most current base).
- State explicitly which branch/commit a task is based on when reporting
  progress, so drift is caught early next time.

## Never Do

- Never delete a branch or drop a stash without confirming its contents are no
  longer needed.
- Never silently discard uncommitted work to "get a clean checkout."
- Never treat a merge commit's parent branch name as proof of what's actually
  in it — check the real diff.

## Checklist

- [ ] Correct base verified by diffing candidates, not assumed by name.
- [ ] `git status` checked before any branch switch or destructive command.
- [ ] Uncommitted unrelated work stashed with a descriptive message, not lost.
- [ ] Stash verified to have actually cleared the working tree (residual diff
      checked if anything looks still-dirty).
- [ ] Commits scoped and reviewed (`git status` after `git add`) before commit.

## Expected Output

Work based on a verified-current branch, with any pre-existing uncommitted
work safely preserved (stashed, not lost), and commits that are scoped,
reviewed, and clearly described.
