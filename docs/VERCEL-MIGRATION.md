# Vercel migration runbook

> **Status:** APP, BMS and SEQ now serve their public domains from Vercel after explicit user release approval. All four HTTPS hosts and three Neon readiness checks pass. The approved dump/media recovery is complete; payment configuration and remaining feature/recovery acceptance are still open.
> **Scope:** APP, BMS, SEQ, PostgreSQL, media, daily BMS job, domains, external callbacks.

Genealogiq runs as three independent Next.js projects on Vercel. This runbook records the current release and remaining acceptance. The user updated Hostinger on October 20 before deployment acceptance. The first releases were staged with `--prod --skip-domain`; subsequent explicit release approval authorized Production rebuilds with recovered provider settings and domain assignment. No Git push occurred. Azure remains unavailable as a working rollback target.

## Current blocker and decision

The live Azure subscription was observed as `Disabled` on 2026-10-19 and again on 2026-10-20. Listing the existing `database-backups` container in `stgenohqluyie` failed with `AccountIsDisabled`. The October 19 production health requests timed out.

On October 20 the user explicitly approved recovering from the latest available dump because Azure recovery was unavailable. Inventory found identical `genealogiq.dump` files in the repository root and Downloads (320,986 bytes, SHA-256 `e0b1b0cdde132fe0c60afd993afa8e683fb7d3e501c149f8ee17f33cd04be8b8`). This plain SQL dump contains 117 consumer profiles, 400 GenCodes, 19 documents and migration history; its latest recorded creation/update timestamps are September 9, and the file was copied on September 22. The separate `.azure/genealogiq-pre-azure.dump` contains mostly local fixtures and was not selected. Recovery cannot reproduce later Azure changes.

The selected dump was restored in Neon after a local rehearsal and target backup; all eight pending canonical migrations succeeded. All 42 source-table row counts matched after restore and the migrated schema matches Prisma. The existing guarded Premium expiry repair corrected 44 eligible independent-consumer test allowances; three tenant-linked test allowances remain outside that repair's scope and require review before launch. Details and recovery artifacts are in the [recovery audit](audits/NEON-RECOVERY-2026-10-20.md).

Neon through the Vercel Marketplace is the target PostgreSQL provider. Select São Paulo (`sa-east-1`) and a plan with at least 14 days of point-in-time recovery. Vercel Functions use São Paulo (`gru1`). Vercel does not provide a first-party PostgreSQL database; Neon remains the database provider. Payment processing, email, Google sign-in, Turnstile, push and Sentry remain external services.

## Vercel project setup

Three project shells have been created in the `Genealogiq Brasil` Vercel team. Their current IDs and attached domains are:

| Project | Vercel ID | Root directory | Attached production domains |
| --- | --- | --- | --- |
| `genealogiq-app` | `prj_ADnKLeafBavDDoSXs1jPR93WLqdO` | `apps/app` | `genealogiq.com.br`, `www.genealogiq.com.br` |
| `genealogiq-bms` | `prj_2h6dVuwvs8o8mUFFQpNIapx6CA9n` | `apps/bms` | `bms.genealogiq.com.br` |
| `genealogiq-seq` | `prj_o6vtJmB4cEZGb88ULAtvrWCQQZpv` | `apps/seq` | `sequoia.genealogiq.com.br` |

The Vercel API reports these domains as verified on the projects. After the
user's October 20 Hostinger update, all four DNS configurations are accepted;
the first staged deployments are listed below. The project settings specify Node 22,
app root directories, monorepo frozen install/build commands, and `gru1`.

Install with `pnpm install --frozen-lockfile` and build the selected workspace app with Turbo (for example, `pnpm exec turbo run build --filter=@genealogiq/app`). The root `engines.node` range is `>=22`; the first deployed functions report `nodejs24.x` despite the Node 22 project setting. Do not infer the effective runtime from that setting alone. The project configuration files request Functions in `gru1`; BMS retains the daily cron at 06:00 UTC and its 300-second function duration. Use a Vercel Pro team because these are commercial production applications and the cron is a production workload.

Required manual account actions:

1. Authorize GitHub access to `genealogiqdev/genealogiq`. Pro is now confirmed for `Genealogiq Brasil` by Chrome and Vercel's Git deployment context API. The earlier Hobby observation is retained in the audit. No repository is connected. Before connecting or pushing, reconcile the reviewed local release with GitHub: at `d41ef02`, local main was five commits ahead of `origin/main` (`6828b4d`), with no remote-only commits. The existing push-to-main workflow deploys Azure; do not accidentally trigger it while preparing Vercel.
2. The existing Neon resource is connected to all three production projects; do not provision another database or repeat its restore. Resolve recovery retention before cutover. Runtime uses the pooled `DATABASE_URL`; `DATABASE_URL_UNPOOLED` is reserved for reviewed migration/restore jobs.
3. Exercise uploads/downloads against the connected Blob stores before enabling production traffic. The adapter is implemented behind MEDIA_STORAGE_PROVIDER=vercel. Historical Azure document URLs remain public until source access is restricted at cutover (DOCUMENTS-G1).
4. Add all required application environment variables in each project using the per-app `.env.example` files and [CONFIGURATION](CONFIGURATION.md). Set `AUTH_URL`, `APP_URL`, `BMS_URL`, and `SEQUOIA_URL` to the final hostnames. Use distinct `AUTH_SECRET` values per app. Do not copy values into this document or Git.

### Production configuration prepared on October 20

The environment API independently verified these nine non-secret keys in each project, scoped only to production: `APP_URL`, `BMS_URL`, `SEQUOIA_URL`, `AUTH_URL`, `AUTH_TRUST_HOST`, `DATABASE_POOL_MAX`, `MEDIA_STORAGE_PROVIDER`, `MEDIA_PUBLIC_BASE_URL`, and `NEXT_PUBLIC_MEDIA_PUBLIC_BASE_URL`. Shared origins use the final domains above; `AUTH_URL` uses the corresponding app origin, trusted host is `true`, the pool limit is `5`, and the provider is `vercel`. Both public-media base values are `https://nvg2gn8zy3r46uiv.public.blob.vercel-storage.com`.

Both pooled and direct Neon URLs are sensitive, production-only variables in every project. The authenticated CLI added three independent `AUTH_SECRET` values, BMS `CRON_SECRET`, and the existing validated live `STRIPE_SECRET_KEY` to each app: seven new Secret variables, verified by key/type/target without exposing values. The Stripe account read identifies Genealogiq, and existing enabled webhook URLs already match the three final domains. Their distinct `STRIPE_WEBHOOK_SECRET` values remain pending.

The existing BMS Resend key is valid with send-only scope. GET /domains returns 401 `restricted_api_key`; the recipient-free send probe returns 422 `missing_required_field`, confirming authentication without sending email. The earlier invalid-key diagnosis was incorrect. Under the user's explicit release authorization, this key is now a Production Secret in all three apps; the replacement-key form is unnecessary. BMS also has its own local webhook secret configured, with the actual Stripe endpoint match still unverified. APP's local signing value duplicates BMS and was not copied to its separate endpoint; SEQ has no local value. Complete their endpoint-specific secrets and enabled Google, APP Turnstile/push and observability configuration. Sensitive values stay in provider secret storage; a local `env pull` is not proof that Secret values are available locally. Rebuild after environment changes before repeating affected checks. See the [release audit](audits/VERCEL-RELEASE-2026-10-20.md).

### First staged deployments, October 20

These releases use exact source `56f72f4602f1d396aa6200955500852a7d7ed3d1`. The source-only archive uploaded 1,328 files (13,831,269 bytes); local credentials, dumps, QA artifacts and dependencies were excluded. All three remote builds finished READY. They use production resources but remain protected and unpromoted to custom domains.

| App | Protected deployment | Deployment ID |
| --- | --- | --- |
| APP | [Staged APP](https://genealogiq-dpu1glxh7-genealogiq-brasil.vercel.app) | `dpl_Caw8DWffJC45sg3Cx63eKTVQd43F` |
| BMS | [Staged BMS](https://genealogiq-jidk27k5w-genealogiq-brasil.vercel.app) | `dpl_142AhTRYqBAyBdsBeeUokkVvEzH2` |
| SEQ | [Staged SEQ](https://genealogiq-2pcr39dwe-genealogiq-brasil.vercel.app) | `dpl_3u7FGCckB1nEY3C3MjNZoATy4Xh6` |

Authenticated `vercel curl` returned readiness 200 with `status=ready` from all three real Neon connections, APP anonymous document 401 and unsigned BMS cron 401. Chrome rendered APP pricing and all three sign-in forms; blank submissions showed Invalid data. Successful sign-in, tenant boundaries, persistence, provider delivery and authorized media flows remain unverified. See the [staged deployment audit](audits/VERCEL-STAGED-DEPLOYMENTS-2026-10-20.md) for build/runtime warnings and evidence limits.

### Public release, October 20

After the user explicitly authorized promotion, Vercel rebuilt the same source with current environments and automatically assigned all four custom domains. APP `dpl_D94wKR658w56r3hWNEbGADFVBk6k`, BMS `dpl_ABpnSpvr2HGjVbSydCW24A6ztHbb` and SEQ `dpl_3aDnMopsVRH7Unw9r9vjdM7jUJyH` are READY. All four public roots return 200 over validated TLS and all three readiness routes return 200/status ready. Chrome verifies the homepage, three sign-in forms and blank-input rejection. BMS accepts a signed irrelevant webhook probe and rejects an invalid signature; actual Stripe endpoint matching and APP/SEQ signing configuration remain open. [Release audit](audits/VERCEL-RELEASE-2026-10-20.md).

## Prepared Neon resource

The existing Marketplace integration is `icfg_IJBd5OCN9p9CUJcv8ki5E6FR`. Its database `neon-copper-nest` has Vercel store ID `store_JYKKhOoGN8sq5En5`, Neon project ID `icy-credit-38971700`, and region metadata `gru1` (São Paulo). It is available on plan `free_v3`, with APP, BMS and SEQ connected. The earlier empty target now contains 50 public-schema tables after the approved recovery. The nine `neon_auth` starter tables were preserved. Neon Auth being enabled by the integration does not replace the application's existing NextAuth identity model.

All three connections use sensitive credentials, default variable names, production only, and no automatic per-deployment database branches. Chrome and the environment API independently verified these settings after the user's confirmation. Keep preview/development isolated from production.

Neon Free currently allows 1 GB per project and 100 CU-hours per month. Its restore window is up to six hours or 1 GB of changes, whichever is reached first; this does not meet the approved 14-day point-in-time recovery requirement. Preparation can continue on Free, but production cutover still requires the agreed recovery retention and an actual restore rehearsal, or an explicit revised recovery decision. The recovered target measured about 13.1 MB before media-reference updates; this does not predict future compute or storage usage. The user's approval of an older recovery source did not change the future retention requirement. See [Neon plans](https://neon.com/docs/introduction/plans) and [pricing](https://neon.com/pricing); plan limits can change.

## Prepared Blob resources

Both stores were created in GRU1 on 2026-10-19:

| Store | ID | Use |
| --- | --- | --- |
| genealogiq-media-public | store_NVG2gN8zy3r46uIV | Verified public media |
| genealogiq-media-private | store_9bhZedgkBfKtS939 | Private upload staging and all PDFs |

Both stores are connected to APP, BMS and SEQ production, verified in Chrome and by the environment API. Each project has sensitive BLOB_PUBLIC_READ_WRITE_TOKEN and BLOB_PRIVATE_READ_WRITE_TOKEN variables scoped only to production. Preview/development need separate stores before receiving real media. The first private-store API call created the store but failed connecting it because of the default environment-key collision; Chrome recovered the existing store. Never recreate it under another name to bypass that error.

## Database migration

The October 20 restore is complete. Do not repeat it against the populated target. These steps describe future reviewed restores, using a current backup or an explicitly approved older recovery point.

1. Take a fresh, transaction-consistent PostgreSQL backup and record its source, timestamp, schema revision and checksum. Keep the original backup read-only.
2. Verify the existing São Paulo Neon database, enable at least 14-day point-in-time recovery, and connect pooled runtime and direct migration credentials as sensitive Vercel environment variables.
3. Restore the backup into Neon. Apply no application writes during the final copy. Preserve the single canonical schema and all rows; use `packages/db/prisma/schema.prisma` and its migration history as the expected schema contract.
4. Compare schema and representative table counts, run read-only integrity checks, then test login, tenant and role boundaries, and a disposable persisted update against Neon.
5. Exercise Neon point-in-time restore in a separate test branch/database before production promotion. Record observed recovery point and restored row checks.

Do not point `prisma migrate deploy` at production until the source snapshot and target restore have been reviewed. Preserve the selected source and its migration history; do not reset or rebaseline the restored database. The separate pre-Azure fixture dump is not the approved recovery source.

## Media migration and private access

The adapter defaults to Azure for local development/rollback and selects Vercel explicitly. The historical migrate:media command still targets Azure. The new `pnpm --filter @genealogiq/services migrate:media:vercel` command inventories referenced Azure/old Vercel media, preserves original URLs, compares byte counts/SHA-256, rewrites references conditionally, and supports rollback from a durable manifest. See [MEDIA-MIGRATION](MEDIA-MIGRATION.md) for its separate stages.

The Vercel adapter uploads into private staging, retains each route's owner/profile scope, and validates actual size/type/signature before publication. All PDFs remain private; the authenticated /api/documents/[id]/file route checks live document visibility and accepted guardianship. Historical public Azure/old Vercel source URLs can still bypass this route. Restrict the old source and account for cached copies at cutover, then verify anonymous denial before closing DOCUMENTS-G1.

On October 20, all 103 objects referenced by the approved dump were available from the old public Vercel store. All were copied and verified by byte count/SHA-256; 84 targets are public and 19 document targets are private with anonymous denial and authenticated reads verified. All 103 references were rewritten, rolled back to independently checked original values, and reapplied to independently checked target values. Copy replay retained the completed manifest. The final Neon backup includes these target references. Source objects remain intact. This completes the named recovery, while deployed upload/download authorization and old-source access restriction remain launch gates.

For future migrations, require accessible source bytes and verified public/private destinations before guarded reference rewrites. Preserve the source and durable manifest through the rollback window; do not delete source objects as part of copying. Azure availability is not a prerequisite for the already-completed recovery from the user's approved dump and accessible legacy Blob sources.

## Hostinger DNS and external services

Attach the four domains in Vercel first, then copy the exact DNS records Vercel displays into Hostinger. The records may differ by hostname/project; do not guess them from a generic A/CNAME example. Preserve all existing MX, SPF, DKIM and DMARC records. No registrar transfer is needed.

### Hostinger records prepared on October 20

In hPanel, open Domains → genealogiq.com.br → DNS/Nameservers. Keep the existing Hostinger nameservers (`pixel.dns-parking.com`, `byte.dns-parking.com`). Save the current zone, then replace only the old Azure website records at cutover:

| Type | Name | Value |
| --- | --- | --- |
| A | @ | 216.150.1.1 |
| CNAME | www | 73eb46deb7a75d29.vercel-dns-017.com |
| CNAME | bms | 887e50f92d2ea1fa.vercel-dns-017.com |
| CNAME | sequoia | 8a6c8eb08070084e.vercel-dns-017.com |

Vercel's domain-configuration API returned the three CNAME targets; the APP domain panel independently displayed `A @ 216.150.1.1`. The user subsequently applied these records. Hostinger's authoritative server and Cloudflare's resolver returned all four expected targets. Vercel initially retained an old apex address but now reports all four as correctly configured. Observed TTLs are 1,600 seconds for apex, 300 for www, and 14,400 for BMS/SEQ; other resolvers can retain earlier cached answers. Nameservers remain Hostinger. Mail records were not changed or independently audited in this follow-up.

The initial staged builds left apex/www at 404 and BMS/SEQ without successful TLS. After the authorized public release, all four hosts now return 200 over validated TLS and all three database readiness checks pass. No further Hostinger website change was needed. The earlier [DNS follow-up](audits/HOSTINGER-VERCEL-2026-10-20.md), [staged audit](audits/VERCEL-STAGED-DEPLOYMENTS-2026-10-20.md) and [public release audit](audits/VERCEL-RELEASE-2026-10-20.md) preserve the progression separately.

Update provider allowlists after the Vercel project URLs exist:

- Google OAuth authorized origins and callback URLs for APP, BMS and SEQ.
- Stripe webhook endpoints and signing secrets for each app's existing webhook route.
- Turnstile hostnames; verify that the existing site key accepts each production hostname.
- Any email, push or Sentry hostname restrictions required by those providers.

Hostinger's website DNS changes are applied and the releases now serve those domains. No further website record change is required; preserve mail records. Remaining provider configuration and feature acceptance below are follow-up work.

## Cutover gates and rollback

The user explicitly authorized public release before every prior acceptance gate was complete. Keep the following acceptance requirements open where the recorded scenario has not passed; release approval does not mark them verified:

- Neon schema parity, representative row counts, sign-in, tenant/role boundaries, persisted update and point-in-time restore.
- Public media upload/read, private media denial for unauthorized users, successful authorized private download, and checksums for migrated objects.
- Valid and invalid signed Stripe webhook requests; daily BMS cron authorization, completion and duplicate protection.
- Health/readiness for all three production deployments and HTTPS certificates for all four domains.
- OAuth callback, Turnstile and outbound email on final hostnames.

The October 20 recovery uses the user's approved older source; a fresh Azure backup or delta is unavailable and is no longer a prerequisite. The new public apps use Neon. Preserve its accepted recovery backup and media manifest; future rollback must account for new writes made after release. Hostinger already has the target records. Preserve existing Azure resources and old media without assuming they are usable.

Azure currently cannot serve as a working rollback destination. Before launch, establish a verified Vercel deployment rollback and a tested database/media recovery procedure. Application rollback must account for schema compatibility; reference rollback does not restore later business writes. Restore DNS to Azure only if its services and authoritative data have independently recovered. Never accept writes on both databases concurrently.

## Verification log

The [October 30 consolidated release](audits/PRODUCTION-RELEASE-2026-10-30.md)
reviews subsequent feature chats and records all three promoted production
builds from `694dd1f`, identical to merged main `2066c6b`. GitHub PRs #207–#209
are merged, CI and all container builds pass, and four public HTTPS hosts plus
three Neon readiness checks pass. The legacy Deploy Azure workflow is now
disabled. Deployment remains an explicit source-archive/stage/probe/promote
operation, with recorded previous Vercel rollback candidates. Existing payment,
authenticated acceptance and recovery requirements below are not closed by this
release.

| Date | Source / target evidence | Result and limits |
| --- | --- | --- |
| 2026-10-19 | Azure CLI subscription state, production health requests, local dump inventory; Vercel MCP team/project inventory | Azure subscription disabled; health requests timed out; local dump is pre-Azure; Vercel team has no projects or domains. Production migration and DNS cutover are blocked. |
| 2026-10-19 | Follow-up at 268d3f2 plus migration changes; Vercel MCP and Chrome | Three project shells/four domains prepared; both GRU1 Blob stores connected to all three production projects with sensitive tokens. Adapter, authenticated document delivery and guarded reverse migration implemented. Three local app builds pass. Azure remains Disabled; Neon and real-provider cutover checks remain pending. See the [layered audit](audits/VERCEL-MIGRATION-2026-10-19.md). |
| 2026-10-20 | d41ef02; Vercel environment/integration/Git APIs, Chrome Billing/data editor, live Azure ARM and backup storage | Existing Neon Free resource verified in São Paulo; project access awaits confirmation. Nine non-secret production settings added and read back per app. Team still reports Hobby despite the reported upgrade. Azure remains Disabled and backup storage returns AccountIsDisabled. No application deployment, data copy or DNS change. See the [follow-up audit](audits/VERCEL-MIGRATION-2026-10-20.md). |
| 2026-10-20 | 2da3a06 plus recovery documentation; explicit older-dump approval, local PostgreSQL, live Neon/Blob, Chrome and environment API | Pro and all three production Neon connections confirmed. Restored 117 profiles/400 GenCodes/19 documents; eight migrations and schema parity pass. Repaired 44 eligible test allowances; five repair test entries pass. All 103 media objects passed copy/hash/access/rewrite/rollback/replay, including 19 private documents. Secrets, app/provider acceptance, three partner terms, recovery retention and DNS remain pending. [Recovery audit](audits/NEON-RECOVERY-2026-10-20.md). |
| 2026-10-20 | 773be4d plus DNS follow-up; user report, Hostinger authoritative DNS, Cloudflare resolver, Vercel APIs and Chrome | All four new DNS records match; Vercel accepts their configuration. Apex/www TLS succeeds with 404; BMS/SEQ TLS remains unverified. No deployments or Git connections exist and app auth/cron/provider settings remain incomplete. CLI sign-in is prepared for the user. [DNS audit](audits/HOSTINGER-VERCEL-2026-10-20.md). |
| 2026-10-20 | `56f72f4`; authenticated CLI, source-only archives, Vercel builds/API/HTTP and Chrome | Three production releases READY without custom-domain promotion. Seven core Secret variables verified, all three Neon readiness checks pass, anonymous document and unsigned cron return 401, and blank sign-in forms reject input. Resend returns 401; webhook secrets and other provider/authenticated acceptance remain pending. [Staged audit](audits/VERCEL-STAGED-DEPLOYMENTS-2026-10-20.md). |
| 2026-10-20 | `56f72f4` source; explicit release approval, corrected Resend scope, remote rebuilds, APIs, HTTPS and Chrome | All three new releases READY and assigned to custom domains; four HTTPS roots/three Neon readiness checks pass. Existing send-only Resend key configured in all apps; local BMS webhook accepts signed no-op/rejects bad signature. APP/SEQ webhook secrets and remaining acceptance stay open. [Public release audit](audits/VERCEL-RELEASE-2026-10-20.md). |

## Related

[Azure deployment history](AZURE-DEPLOYMENT.md) · [Azure operational runbook](AZURE-AGENT-RUNBOOK.md) · [Configuration](CONFIGURATION.md) · [Database](DATABASE.md) · [Media storage](MEDIA-STORAGE.md) · [Media migration](MEDIA-MIGRATION.md) · [Open gaps](GAPS.md)
