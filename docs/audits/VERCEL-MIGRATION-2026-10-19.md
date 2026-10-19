# Vercel migration preparation — 2026-10-19

## Scope and source

Continuation of the approved migration session on main at 268d3f2, including its interrupted, uncommitted project configuration. No production database/media rewrite, deployment or DNS cutover occurred. Azure remains authoritative. Historical Azure deployment evidence is not current service evidence.

The change adds provider-selected Azure/Vercel media storage, private staging with size/type/signature checks, private PDF delivery through a live owner/accepted-guardian/visibility guard, and a release-only reverse migration command. The command requires an explicit Neon/loopback database host, durable locked manifest, independent source/destination hashes, conditional reference rewrites and recorded rollback. Source objects are retained. Existing Azure behavior remains the default.

## Automated checks

- Full pnpm test: 150 files / 1,404 tests passed; eight files / 51 opt-in tests skipped.
- After the final migration retry changes: four focused files / 37 tests passed (17 adapter, ten migration, seven document-route, three client transport). This includes mismatched existing targets, provider failure, already-copied replay, unrelated private readers, revoked visibility, anonymous requests and failed provider reads.
- Prisma generation and repository typecheck passed; the final services typecheck passed after the release-job cleanup change.
- Sequential lint passed with 49 existing warnings (APP eight, BMS 21, SEQ 20), no errors. An interrupted dependency installation initially left eslint-plugin-import unavailable; frozen offline install repaired the local installation before the successful run.
- Sequential Vercel-mode builds passed for APP, BMS and SEQ (four Turbo tasks including generation). These are local builds, not Vercel deployments or clean Azure container packaging.
- Schema parity, 78 migration-directory checks and locale parity passed. Translation-reference check reported zero errors, 95 dynamic references and one unmapped reference.
- Enabled Azurite integration: one real authorize/upload/overwrite-denial/complete/read/delete scenario passed.
- Documentation/index validation passed; final link validation is recorded with the commit.

Ignored logs are under .local-qa/vercel-*.log. Test counts describe the actual runs; skipped provider/database suites are not passes.

## Local runtime

Compose PostgreSQL and Azurite were started using existing local volumes. All three readiness endpoints returned 200. The launcher forces Azure/Azurite and clears cloud Blob credentials. Normal APP Credentials authentication succeeded through CSRF/callback/session; no session bypass was used.

Authenticated document upload rejected an unsupported type and an unknown profile (400); anonymous file access returned 401. A disposable PDF completed the real Azure/Azurite authorize/direct PUT/complete path; downloaded bytes matched the fixture. Its owned object was removed and returned 404 afterward. No document row was created by this HTTP upload check.

The first Chrome development render failed because Tailwind scanned the unignored .next-vercel-qa build output and generated invalid CSS from cache bytes. Git, ESLint and Docker now ignore this output. A fresh isolated .next-qa-4000 build rendered successfully. Existing generated output was retained; do not interpret it as source or deployment output.

## Chrome UI and persistence

Normal APP sign-in and the document form rendered successfully. Blank submission displayed required-title, category and media-URL validation. The extension blocked fixture upload because Allow access to file URLs was disabled; browser upload/save/reload/private-download checks remain pending that permission. The real HTTP/Azurite check above does not establish browser upload success.

BMS normal sign-in, company trade-name change to Genealogiq Local QA 2026-10-03, reload and an independent PostgreSQL query passed. The fixture was restored to Genealogiq Local and independently checked. After normal sign-out, the company edit route redirected to sign-in.

SEQ normal sign-in, company trade-name change to Local Tenant QA 2026-10-03, reload and an independent PostgreSQL query passed. Restored Local Tenant, confirmed the database value, signed out and verified the edit route redirects to sign-in.

APP removed and restored Rex as a favorite, then reloaded; the database independently showed exactly one viewer/Rex favorite. The owner tree displayed seven people across four generations and two pets. Zoom, fit and Rex search worked; the tutor sheet showed Marina Silva and Local Admin. Normal sign-out followed by /home redirected to sign-in. The owner still had zero document rows; no UI upload fixture was persisted.

## Live infrastructure and remaining gates

The live Azure subscription still reported Disabled. The available September 21 pre-Azure dump is not a current backup and was not restored. A current production database and media source must be recovered before migration.

Vercel has three project shells with their four attached production domains and no deployment. Chrome confirmed the Genealogiq Brasil team is Hobby. Pro upgrade, GitHub repository authorization, Neon Marketplace provisioning in sa-east-1 with at least 14-day recovery, and a demonstrated restore remain manual prerequisites.

Created GRU1 stores genealogiq-media-public (store_NVG2gN8zy3r46uIV) and genealogiq-media-private (store_9bhZedgkBfKtS939). The private create API persisted the store before its project connection failed with a default-key collision; Chrome recovered the existing store. After explicit user approval, both stores were connected to APP/BMS/SEQ production only. Each project has sensitive BLOB_PUBLIC_READ_WRITE_TOKEN and BLOB_PRIVATE_READ_WRITE_TOKEN variables. Chrome shows three connected projects per store; API inspection independently confirmed key names, sensitivity and production scope without printing values. Screenshot: ignored .local-qa/vercel-blob-connected.png.

Real Vercel direct uploads, anonymous private-object denial, authorized PDF streaming, migrated checksums, restore/rollback rehearsal, Stripe signatures, cron execution, OAuth/Turnstile/mail and final HTTPS remain n/a until the provider/data prerequisites are available. DOCUMENTS-G1 and MEDIA-MIGRATION-G1 remain open. Hostinger DNS was not changed.

## Cleanup

The owned APP/BMS/SEQ launcher was stopped; no listener remained on 3000–3002 or 4000–4002. The PostgreSQL and Azurite Compose services started for this audit were stopped. Existing volumes and ignored QA evidence/build caches are preserved. The BMS/SEQ names and APP favorite were restored and independently checked; the HTTP-upload object was deleted. Generated tsconfig additions were removed from the commit. No credential values are included in source, documentation or screenshots.

## Next operation

Follow [VERCEL-MIGRATION](../VERCEL-MIGRATION.md). Recover the current source, complete account/database setup, configure application secrets, rehearse copy/verify/rewrite/rollback and provider access, then deploy and verify before the final manual Hostinger cutover. Never substitute the historical local dump for current production data.
