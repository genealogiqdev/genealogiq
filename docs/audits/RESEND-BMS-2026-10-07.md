# BMS Resend configuration refresh — 2026-10-07

The user reported a `Missing API key` toast when sending a GenCode payment link
and authorized applying the Resend credential from `apps/bms/.env` to Azure.
The screenshot did not include a browser origin; the origin clarification was
unanswered at the time of this audit. This refresh verifies Azure configuration
and authentication, not resolution of the original browser action or delivery.

## Source evidence

- Starting branch: `main`, source revision `218d5aa6cc34b71e6e0a2007db78119d69f4e82f`.
  Initial unrelated untracked paths were `assets/` and `envs`.
- Read root/BMS guides, GenCode package and email feature documents, gap index,
  Azure/configuration/testing/local runbooks and the installed Next environment
  guide. Rechecked relevant source history since `6e06634`.
- Traced `/gencodes/new` through `verifyAdmin`, the Zod order schema, tenant
  query, shared checkout and `sendSalePaymentLinkEmail`. The email step follows
  checkout creation. The Resend client reads the server variable lazily.
- The immutable deployed image remains
  `acrgenohqluyie.azurecr.io/genealogiq-bms:6e06634a752b44bce24825b0aa25baf0b669fa16`.
  Its email chunks retain runtime `process.env.RESEND_API_KEY` reads.
- `scripts/local-qa.mjs` deliberately blanks provider credentials in its child
  environment. A populated `.env` does not enable mail in that mode.
- No application source, database schema, image, Stripe mode or DNS was changed
  by this task. Other workspace edits appeared during QA and were excluded from
  this task's commit.

## Tests

- `pnpm test`: 101 files passed, 840 tests passed; one opt-in Azurite test
  skipped. Includes existing BMS GenCode action/schema and email transport specs.
  This run preceded the later concurrent workspace edits.
- `node scripts/check-docs.mjs`: passed, four guides, 39 features, 2,219 local
  links and 161 source references. Scoped `git diff --check`: passed. No
  application rebuild is needed for reusing an existing image with a refreshed
  server secret reference.

## Azure runtime and provider boundary

1. Verified active subscription
   `c710b26f-e3c7-4a45-9477-eaaf3bdcc329`, state `Enabled`, before writing.
2. Existing BMS `RESEND_API_KEY` already referenced `resend-api-key`, backed by
   the versionless Key Vault URL and the existing `id-genealogiq-prod` identity.
   The BMS `.env` key and Key Vault value matched in a private comparison;
   neither value was printed. Retained the existing shared secret version.
3. Connected to old revision `ca-genealogiq-bms-prod--0000007`. The process had a
   nonempty Resend key, `NODE_ENV=production`, and canonical BMS origin. Stripe
   was not using a test-key prefix. Thus the live Azure state did not reproduce
   the screenshot's missing-key condition.
4. Read-only `GET /domains` returned HTTP 401 `restricted_api_key` because the
   key permits sending only. An empty `POST /emails` from the container returned
   HTTP 422 `missing_required_field`, `Missing to field`. No recipient was
   supplied and no message was created. This proves authentication reaches
   request validation, not sender-domain approval or delivery.
5. Initial what-if using the newer CLI resource representation failed schema
   validation without writes. Rebuilt its input with `az rest` and the template's
   `2024-03-01` API. Successful what-if changed only the BMS revision suffix;
   a read-only `runningStatus` deletion appeared as provider normalization.
   Ignored evidence files: `.azure/resend-refresh-preview.parameters.json` and
   `.azure/resend-refresh-what-if.json`, containing references, not secret values.
6. Reapplied the existing BMS Key Vault reference with `az containerapp secret
   set`, then copied its active revision with suffix `resend-20261007` and
   `RESEND_API_KEY=secretref:resend-api-key`. No full infrastructure deployment,
   migration job or image build was performed.
7. Verified `ca-genealogiq-bms-prod--resend-20261007` is the latest ready revision,
   `Healthy`, `Running`, and receives 100% traffic. Its replica was ready,
   started, and had zero restarts. Its process key was populated and the empty
   Resend probe again returned HTTP 422 `missing_required_field`.
8. All six HTTPS checks returned HTTP 200: live and ready for
   `genealogiq.com.br`, `bms.genealogiq.com.br` and `sequoia.genealogiq.com.br`.
   These checks prove health/database readiness, not a payment or email outcome.

## Local runtime and UI evidence

The normal launcher rejected occupied port 3001. Ports 3000/3001 belonged to an
unrelated Angular project and were left running. Started this repository's
previously stopped PostgreSQL/Azurite services, then used an ignored copy of the
isolation launcher changing only its root resolution and app origins/ports to
3100/3101/3102. Provider disabling, ephemeral app secrets and loopback DB scope
were retained. Existing local fixture identities were used without reseeding.

| Scenario | Expected | Observed / limit |
| --- | --- | --- |
| All-app startup/health | Three local apps and six live/ready HTTP 200 checks | Passed initially; this alone is not baseline UI coverage |
| BMS Credentials | Normal local fixture login reaches protected product | Passed at port 3101 |
| BMS company persistence | `Genealogiq Local QA 2026-10-07` survives reload and SQL read | Passed; restored `Genealogiq Local` through the form and independently read SQL |
| BMS anonymous boundary | After normal sign-out, company route redirects to sign-in | Passed |
| SEQ Credentials/persistence | Normal login; `Local Tenant QA 2026-10-07` survives reload/SQL | Passed at port 3102 before subsequent resolution failures |
| SEQ restoration/boundary | Restore through form, then anonymous redirect | Form restoration stalled and boundary navigation timed out; guarded loopback SQL restored exactly the temporary trade-name value |
| APP favorite/tree/anonymous baseline | Full runbook scenario | n/a: runtime began reporting missing Sentry/next-intl/Prisma dependency resolution during concurrent workspace edits; full UI scenario was not exercised |
| GenCode payment/email | Authenticated link action, delivery and signed webhook/persistence | n/a: no real checkout or message was created; disposable provider replay/inbox scenario remains open |

The APP/SEQ failures were recorded as local limitations; no unrelated dependency
or source repairs were made. The existing email resolved-error and full-provider
fixture gaps remain open. The screenshot's originating process remains unknown.

## Cleanup and recovery

- Restored local company/tenant trade names to `Genealogiq Local` / `Local Tenant`.
  The tenant repair matched both its fixed fixture tax ID and exact temporary
  trade name before changing it; no other local data was reset.
- Closed both owned Azure exec shells. Stopped the owned local QA launcher/app
  processes and the PostgreSQL/Azurite services started for this verification;
  preserved volumes and the unrelated project's listeners. A later cleanup
  check found the shared compose services had been restarted; left them running
  for the other concurrent workspace workflow. Ports 3100/3101/3102 were free.
- Original Azure revision/image was `--0000007` / image tag
  `6e06634a752b44bce24825b0aa25baf0b669fa16`. If necessary, copy that immutable
  image into a new BMS revision with the same environment contract; no database
  rollback is involved. The normal single-revision cleanup removed the old
  revision after the refresh became ready.
- Remaining product verification: identify the screenshot origin, retry from
  the refreshed BMS session, and exercise authorized recipient delivery and the
  signed payment fulfillment scenario separately.
