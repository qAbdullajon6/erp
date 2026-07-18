# GitHub Setup

One-time configuration to make the CI/CD pipeline work against
`github.com/qAbdullajon6/erp`. Nothing here is applied by code — these are
repository/owner settings a maintainer sets in the GitHub UI (or `gh`), plus one
command on the VPS. The workflows in `.github/workflows/` are already written to
match exactly what is below.

> Scope note: this document only *specifies* the settings. No push, no secret,
> and no repo setting was changed by the work that produced it.

## 1. Actions permissions

Settings → Actions → General → **Workflow permissions**:

- Allow GitHub Actions to run. Default token permission can stay **read-only** —
  every workflow declares the exact `permissions:` it needs (`release.yml` asks
  for `packages: write` + `contents: write`; the rest ask for `contents: read`).
- Allow the `GITHUB_TOKEN` to publish to GHCR: this is covered by the
  `packages: write` permission `release.yml` requests; no PAT is required to
  **push** the image.

## 2. Repository secrets

Settings → Secrets and variables → Actions → **Secrets**. Best practice: put the
VPS/deploy secrets on the **`production` environment** (next section) rather than
repo-wide, so only approved deploys can read them.

| Secret | Used by | What it is |
| --- | --- | --- |
| `VPS_HOST` | deploy, rollback | VPS hostname/IP |
| `VPS_USER` | deploy, rollback | SSH user (a deploy user, not root) |
| `VPS_SSH_KEY` | deploy, rollback | **private** SSH key whose public half is in the VPS user's `authorized_keys`. Paste the whole file incl. `BEGIN`/`END` lines and a trailing newline. Not the `.pub`. |
| `VPS_SSH_PASSPHRASE` | deploy, rollback | optional; only if `VPS_SSH_KEY` is passphrase-protected. Local `ssh -i` works via ssh-agent, but CI has no agent — an encrypted key fails auth without this. Prefer a **passphrase-less** dedicated CI key. |
| `VPS_SSH_PORT` | deploy, rollback | optional; workflows default to `22` if unset |
| `SLACK_WEBHOOK_URL` | deploy, rollback | optional; failure notifications. Absent → notify step is skipped, not failed |

`GITHUB_TOKEN` is automatic — never create it. Full inventory (including secrets
that live on the VPS or in the DB, not here) is in **SECRETS_GUIDE.md**.

## 3. Environment protection (`production`)

Settings → Environments → **New environment: `production`**. `deploy.yml` and
`rollback.yml` both declare `environment: production`, so every production action
stops for this gate.

- **Required reviewers**: add the people allowed to approve a prod deploy. This
  is the human gate before anything touches the VPS.
- **Wait timer** (optional): a short delay to allow an abort.
- **Deployment branches**: restrict to `main` and tags `v*`.
- Move `VPS_*` (and `SLACK_WEBHOOK_URL`) here as **environment secrets** so they
  are unreadable outside an approved deploy run.

## 4. Branch protection (recommended) — `main`

Settings → Branches → add a rule for `main`:

- Require a pull request before merging; require ≥1 approval.
- **Require status checks to pass** — select the blocking CI jobs:
  `Web · typecheck · lint · unit · build`, `API · build (compiles src…)`,
  `Migrations · apply to ephemeral Postgres + status`, `Docker · build API image (no push)`.
  Do **not** mark the two non-blocking jobs (`API · lint + full typecheck`,
  `API · unit tests`) as required — they intentionally run `continue-on-error`
  while the telematics `*.e2e-spec.ts` debt is open (see CI_CD_GUIDE.md).
- Require branches up to date before merging.
- Disallow force-push and deletion.

## 5. Tag & release strategy

- Semver tags `vMAJOR.MINOR.PATCH` (e.g. `v1.4.0`) are the release trigger —
  pushing one runs `release.yml` (builds + pushes the GHCR image, creates the
  GitHub Release). Details in **RELEASE_PROCESS.md**.
- Protect tags matching `v*` (Settings → Tags) so only maintainers can cut a
  release.

## 6. GHCR (container registry)

- Pushing is done by CI with `GITHUB_TOKEN` — no setup beyond §1.
- **Pulling on the VPS** needs auth if the package is private. One-time on the box:
  ```bash
  echo "$GHCR_READ_PAT" | docker login ghcr.io -u <github-user> --password-stdin
  ```
  where `GHCR_READ_PAT` is a fine-grained PAT with **`read:packages`** only,
  owned by a machine/deploy account. Alternatively make the `erp-api` package
  **public** (Packages → package → visibility) and skip the login entirely.
  `deploy.sh` runs `docker compose pull api`, which relies on this.

## 7. OIDC — where it fits (and doesn't)

- **Not needed for GHCR**: `GITHUB_TOKEN` already authenticates the push; no
  cloud identity federation involved.
- **Not applicable to the VPS**: deployment is over SSH with a key, which OIDC
  does not replace.
- **Where it *would* matter**: if the pipeline later pushes to AWS ECR or deploys
  to a cloud provider, use GitHub OIDC to assume an IAM role instead of storing
  long-lived `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` as secrets. Called out
  so the keyless path is a deliberate future choice, not an oversight.

## 8. GitHub Apps

- **None required** for the VPS/API pipeline.
- **Vercel GitHub App** — the one app to install, for the frontend. It gives
  native Git-driven deploys (production on `main`, a preview per PR) with no
  secrets in GitHub. This is the recommended frontend architecture; see
  **DEPLOYMENT_PIPELINE.md → Vercel**. Install it against `apps/web` with Root
  Directory `apps/web`.

## One-time checklist

- [ ] Workflow permissions set (§1).
- [ ] `production` environment created with required reviewers (§3).
- [ ] `VPS_HOST` / `VPS_USER` / `VPS_SSH_KEY` (+ optional `VPS_SSH_PORT`,
      `SLACK_WEBHOOK_URL`) added as environment secrets (§2–3).
- [ ] Branch protection on `main` with the four blocking checks (§4).
- [ ] Tag protection for `v*` (§5).
- [ ] VPS `docker login ghcr.io` (or public package) (§6).
- [ ] Vercel GitHub App installed against `apps/web` (§8).
- [ ] Deploy SSH key pair generated; public half in the VPS `authorized_keys`.
