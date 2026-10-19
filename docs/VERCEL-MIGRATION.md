# Vercel migration runbook

> **Status:** application hosting can be prepared; production cutover is blocked until a current database and media source is accessible.
> **Scope:** APP, BMS, SEQ, PostgreSQL, media, daily BMS job, domains, external callbacks.

Genealogiq can run as three independent Next.js projects on Vercel. This runbook records the target and the manual actions still required. Azure remains the production system until every cutover gate below is completed.

## Current blocker and decision

The live Azure subscription was observed as `Disabled` on 2026-10-19. The three production health endpoints timed out. The accessible `.azure/genealogiq-pre-azure.dump` is a pre-Azure snapshot from 2026-09-21 and is not a production backup. Do not use it for cutover. Restore Azure subscription access or locate a current off-Azure database backup and media export before copying data.

Neon through the Vercel Marketplace is the target PostgreSQL provider. Select São Paulo (`sa-east-1`) and a plan with at least 14 days of point-in-time recovery. Vercel Functions use São Paulo (`gru1`). Vercel does not provide a first-party PostgreSQL database; Neon remains the database provider. Payment processing, email, Google sign-in, Turnstile, push and Sentry remain external services.

## Vercel project setup

Three project shells have been created in the `Genealogiq Brasil` Vercel team. Their current IDs and attached domains are:

| Project | Vercel ID | Root directory | Attached production domains |
| --- | --- | --- | --- |
| `genealogiq-app` | `prj_ADnKLeafBavDDoSXs1jPR93WLqdO` | `apps/app` | `genealogiq.com.br`, `www.genealogiq.com.br` |
| `genealogiq-bms` | `prj_2h6dVuwvs8o8mUFFQpNIapx6CA9n` | `apps/bms` | `bms.genealogiq.com.br` |
| `genealogiq-seq` | `prj_o6vtJmB4cEZGb88ULAtvrWCQQZpv` | `apps/seq` | `sequoia.genealogiq.com.br` |

The Vercel API reports these domains as verified on the projects. This does
not mean DNS was changed: Hostinger still points to Azure, and no deployment
is attached to the projects yet. The project build settings use Node 22, the
app root directories, the monorepo frozen install/build commands, and `gru1`.

Use Node.js 22, install with `pnpm install --frozen-lockfile`, and build the selected workspace app with Turbo (for example, `pnpm exec turbo run build --filter=@genealogiq/app`). The project configuration files pin Functions to `gru1`; BMS retains the existing daily cron at 06:00 UTC and its 300-second function duration. Use a Vercel Pro team because these are commercial production applications and the cron is a production workload.

Required manual account actions:

1. Upgrade the Vercel team to Pro and authorize GitHub access to `genealogiqdev/genealogiq`. Chrome verified the team is on Hobby on 2026-10-19; project shells exist but no repository is connected.
2. Create and attach a Neon Marketplace database in `sa-east-1`; approve Neon billing and select recovery retention of at least 14 days. Configure the pooled runtime connection as `DATABASE_URL`; use a direct connection only for Prisma migration jobs if Neon supplies a separate direct URL.
3. Exercise uploads/downloads against the connected Blob stores before enabling production traffic. The adapter is implemented behind MEDIA_STORAGE_PROVIDER=vercel. Historical Azure document URLs remain public until source access is restricted at cutover (DOCUMENTS-G1).
4. Add all required application environment variables in each project using the per-app `.env.example` files and [CONFIGURATION](CONFIGURATION.md). Set `AUTH_URL`, `APP_URL`, `BMS_URL`, and `SEQUOIA_URL` to the final hostnames. Use distinct `AUTH_SECRET` values per app. Do not copy values into this document or Git.

## Prepared Blob resources

Both stores were created in GRU1 on 2026-10-19:

| Store | ID | Use |
| --- | --- | --- |
| genealogiq-media-public | store_NVG2gN8zy3r46uIV | Verified public media |
| genealogiq-media-private | store_9bhZedgkBfKtS939 | Private upload staging and all PDFs |

Both stores are connected to APP, BMS and SEQ production, verified in Chrome and by the environment API. Each project has sensitive BLOB_PUBLIC_READ_WRITE_TOKEN and BLOB_PRIVATE_READ_WRITE_TOKEN variables scoped only to production. Preview/development need separate stores before receiving real media. The first private-store API call created the store but failed connecting it because of the default environment-key collision; Chrome recovered the existing store. Never recreate it under another name to bypass that error.

## Database migration

Do this only after recovering a current source database and verifying the Neon target, retention and restore procedure.

1. Take a fresh, transaction-consistent PostgreSQL backup and record its source, timestamp, schema revision and checksum. Keep the original backup read-only.
2. Provision the Neon database in `sa-east-1`, enable at least 14-day point-in-time recovery, and save both pooled runtime and direct migration connection strings as encrypted Vercel environment variables.
3. Restore the backup into Neon. Apply no application writes during the final copy. Preserve the single canonical schema and all rows; use `packages/db/prisma/schema.prisma` and its migration history as the expected schema contract.
4. Compare schema and representative table counts, run read-only integrity checks, then test login, tenant and role boundaries, and a disposable persisted update against Neon.
5. Exercise Neon point-in-time restore in a separate test branch/database before production promotion. Record observed recovery point and restored row checks.

Do not point `prisma migrate deploy` at production until the source snapshot and target restore have been reviewed. Do not use the September 21 pre-Azure dump as a replacement for current production data.

## Media migration and private access

The adapter defaults to Azure for local development/rollback and selects Vercel explicitly. The historical migrate:media command still targets Azure. The new `pnpm --filter @genealogiq/services migrate:media:vercel` command inventories referenced Azure/old Vercel media, preserves original URLs, compares byte counts/SHA-256, rewrites references conditionally, and supports rollback from a durable manifest. See [MEDIA-MIGRATION](MEDIA-MIGRATION.md) for its separate stages.

The Vercel adapter uploads into private staging, retains each route's owner/profile scope, and validates actual size/type/signature before publication. All PDFs remain private; the authenticated /api/documents/[id]/file route checks live document visibility and accepted guardianship. Existing private APP document URLs remain public on Azure. Restrict the old source and account for cached copies at cutover, then verify anonymous denial before closing DOCUMENTS-G1.

Do not rewrite database media URLs or delete Azure objects until source access is restored, every referenced object passes content checks, public/private read tests pass, and rollback has been exercised. Keep Azure storage and configuration available through the rollback window.

## Hostinger DNS and external services

Attach the four domains in Vercel first, then copy the exact DNS records Vercel displays into Hostinger. The records may differ by hostname/project; do not guess them from a generic A/CNAME example. Preserve all existing MX, SPF, DKIM and DMARC records. No registrar transfer is needed.

Update provider allowlists after the Vercel project URLs exist:

- Google OAuth authorized origins and callback URLs for APP, BMS and SEQ.
- Stripe webhook endpoints and signing secrets for each app's existing webhook route.
- Turnstile hostnames; verify that the existing site key accepts each production hostname.
- Any email, push or Sentry hostname restrictions required by those providers.

These provider dashboards and Hostinger DNS changes are manual. Do not change production DNS until the Vercel deployments pass the checks below.

## Cutover gates and rollback

Before DNS changes, verify:

- Neon schema parity, representative row counts, sign-in, tenant/role boundaries, persisted update and point-in-time restore.
- Public media upload/read, private media denial for unauthorized users, successful authorized private download, and checksums for migrated objects.
- Valid and invalid signed Stripe webhook requests; daily BMS cron authorization, completion and duplicate protection.
- Health/readiness for all three production deployments and HTTPS certificates for all four domains.
- OAuth callback, Turnstile and outbound email on final hostnames.

At cutover, pause writes to Azure, take the final database backup, apply the delta, verify the target, then update Hostinger records. Keep Azure application, database, media and backups intact until DNS has propagated and production checks pass. Rollback means restore DNS to the still-running Azure endpoints and confirm the Azure database remains authoritative; never accept writes on both databases concurrently.

## Verification log

| Date | Source / target evidence | Result and limits |
| --- | --- | --- |
| 2026-10-19 | Azure CLI subscription state, production health requests, local dump inventory; Vercel MCP team/project inventory | Azure subscription disabled; health requests timed out; local dump is pre-Azure; Vercel team has no projects or domains. Production migration and DNS cutover are blocked. |
| 2026-10-19 | Follow-up at 268d3f2 plus migration changes; Vercel MCP and Chrome | Three project shells/four domains prepared; both GRU1 Blob stores connected to all three production projects with sensitive tokens. Adapter, authenticated document delivery and guarded reverse migration implemented. Three local app builds pass. Azure remains Disabled; Neon and real-provider cutover checks remain pending. See the [layered audit](audits/VERCEL-MIGRATION-2026-10-19.md). |

## Related

[Azure deployment history](AZURE-DEPLOYMENT.md) · [Azure operational runbook](AZURE-AGENT-RUNBOOK.md) · [Configuration](CONFIGURATION.md) · [Database](DATABASE.md) · [Media storage](MEDIA-STORAGE.md) · [Media migration](MEDIA-MIGRATION.md) · [Open gaps](GAPS.md)
