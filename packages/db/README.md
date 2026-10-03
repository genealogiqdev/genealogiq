# @genealogiq/db — current entry

The canonical schema/client is shared by all three apps. Read [DATABASE](../../docs/DATABASE.md) for model/migration provenance and [LOCAL-DEVELOPMENT](../../docs/LOCAL-DEVELOPMENT.md) for disposable loopback db push/generation/seed. Deployed migrations now use the manual Azure workflow_dispatch job in [migrate.yml](../../.github/workflows/migrate.yml) and [AZURE-AGENT-RUNBOOK](../../docs/AZURE-AGENT-RUNBOOK.md); ordinary merges do not automatically run migrations.

**Source verification:** 2026-10-03 at `6e06634` + working documentation/test/launcher changes. The older GitHub/Neon/Vercel guidance below is preserved historical memory. Its resource/secret/status claims and operational commands are unverified for the current deployment; it is not the current procedure.

---

# @genealogiq/db

The one canonical Prisma schema. All three apps (`app`, `bms`, `seq`) read and
write the same database through this package — `check:schema-parity` in CI
enforces that no app keeps a schema of its own.

## Migrations

### They apply themselves now

Merging a migration to `main` triggers `.github/workflows/migrate.yml`, which
runs `prisma migrate deploy` **once** and reports `migrate status` before and
after. Nothing else needs doing.

The workflow is path-filtered to `packages/db/prisma/migrations/**`, so an
ordinary merge never touches the database.

### Why a workflow and not the Vercel build

The three apps are three Vercel projects that build **in parallel** from this
repo against **one** database. Putting `migrate deploy` in each build command
would fire three concurrent migrations on every deploy: Prisma's advisory lock
would serialise them, but two of the three would be pure waste and a lock
timeout would fail a deploy for no reason. Preview builds would also migrate
production. One job, one run.

### One-time setup (needed before the first automated run)

The credential has to live as a **GitHub Actions secret**. This is a different
place from the two that look like it:

| Where | Who reads it | Reaches the migrate workflow? |
| --- | --- | --- |
| `apps/*/.env` | your machine | **no** — gitignored, never leaves the laptop |
| Vercel project env vars | Vercel builds and runtime | **no** — the workflow runs on GitHub Actions |
| **GitHub → Secrets and variables → Actions** | GitHub Actions | **yes** |

Setup:

1. GitHub → Settings → Secrets and variables → **Actions** → New **repository**
   secret.
2. Name it `DATABASE_URL_DIRECT`, value = the Neon connection string for the
   production branch, **without** `-pooler` in the host. Paste it unquoted —
   GitHub stores the value verbatim, quotes included.

Faster than the UI:

```bash
gh secret set DATABASE_URL_DIRECT --repo bahiensed/genealogiq
# paste the value at the prompt, then press Ctrl-D
```

A repository secret rather than an environment secret: environment secrets and
deployment protection rules require GitHub Pro/Team/Enterprise on a private
repo, and this repo is private on a free account. Repository secrets work on
every plan. The reviewer gate is therefore unavailable; the path filter, the
pooler guard and the no-cancel concurrency group carry that weight instead.

That last part matters: the app's normal `DATABASE_URL` points at Neon's
pooler, and DDL over PgBouncer in transaction mode fails or hangs. The workflow
refuses to run if the URL it is given contains `-pooler`, rather than hanging.

`prisma.config.ts` reads `DATABASE_URL`, so the direct URL is supplied under
that name in the workflow.

Nothing needs a `DATABASE_URL_DIRECT` in the apps themselves — they connect
through the pooler and never run DDL. Adding it to `.env` or to Vercel is
harmless but does not feed the workflow.

### Known drift: seven records with no local file

`_prisma_migrations` lists seven migrations from before the three-repo
consolidation (`20260324…` through `20260415…`) that were squashed into
`0_init`. They are applied in the database and have no local counterpart, so
**`prisma migrate status` exits non-zero permanently** and says "The migrations
from the database are not found locally".

That is expected and harmless: `migrate deploy` only cares about the other
direction (local files not yet applied). It does mean a bare `migrate status`
cannot be used as a success check — the workflow greps for "have not yet been
applied" instead of trusting the exit code.

Clearing the seven rows would make status clean, but it rewrites migration
bookkeeping in production for cosmetic gain, so it has been left alone.

### Running one by hand

Rarely needed — `workflow_dispatch` replays the workflow without an empty
commit. If you do need to:

```bash
# from the repo root, with DATABASE_URL pointing at the DIRECT (non-pooled) host
pnpm db:migrate:status    # what is pending
pnpm db:migrate:deploy    # apply it
```

Never run `prisma migrate dev` against production — it can reset and reseed.
`deploy` only applies what exists and never generates or destroys.

### Writing one

Migrations are hand-written SQL under
`packages/db/prisma/migrations/<14-digit-timestamp>_<name>/migration.sql`.
`pnpm check:migrations` (blocking in CI, no DB credential involved) verifies
each one has a non-empty `migration.sql` and a unique, correctly-ordered
timestamp — Prisma applies migrations in lexicographic order, so a timestamp
that sorts before an already-applied one is silently skipped.

`0_init` is the squashed baseline from the three-repo consolidation and is
exempt from the timestamp rule.

Destructive migrations deserve a comment block recording the read-only survey
that justified them — see `20260823000000_retire_digital_qr` for the shape:
what was counted, what it showed, and why the deletion was safe.

## Client generation

`postinstall` runs `prisma generate`, so a fresh `pnpm install` is enough.
After editing `schema.prisma`, run `pnpm db:generate` to refresh the client —
typecheck will otherwise still be validating against the old shape.
