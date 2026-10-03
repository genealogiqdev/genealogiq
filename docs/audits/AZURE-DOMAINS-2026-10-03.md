# Hostinger / Azure domain cutover — 2026-10-03

## Scope and source

The user authorized configuring the existing Azure instances for
`genealogiq.com.br`, applied the Hostinger records, and explicitly requested
the Azure-side continuation. Hostinger was changed by the user, not this agent.
Source baseline is `7d267f7` plus the domain infrastructure/scripts/docs changes;
the prior `6e06634` verification and subsequent marketing/documentation commits
were rechecked. Unrelated `assets/` and `envs` were preserved. No commit or push
was made.

The [deployment runbook](../AZURE-DEPLOYMENT.md#dns-and-managed-tls) owns exact
records and commands. Durable source changes parameterize canonical origins and
certificate bindings, preserve active settings during future Bicep application
deployments, and retain new plus legacy/local media CORS origins. The CLI cutover
checks subscription, all routing/TXT records on two public resolvers, generated
health endpoints, and a scoped what-if before writes. It issues managed TLS,
updates origins only after every custom HTTPS host is healthy, and waits for
the latest revisions rather than accepting older-revision health responses.

## Automated checks

| Layer | Actual result | Limits |
| --- | --- | --- |
| PowerShell domain tests | Pass: read-only discovery, missing DNS, health failure, four HTTP/CNAME certificate bindings, independent origin expectations, refreshed bindings during waits, idempotent rerun, and stale-ready-revision rejection | Mock CLI/DNS/HTTP; not live certificate proof. Disposable test workspace avoids overwriting production previews. |
| `pnpm test` | 101 files / 840 tests passed; one opt-in Azurite test skipped | Named deterministic repository cases; not provider or production login proof. |
| Schema/migration/i18n checks | One canonical schema, 74 ordered migrations, locale parity passed; keys zero errors, 79 dynamic skips and one unmapped columns file | No DDL replay, deployed schema parity or complete dynamic-key coverage claim. |
| Bicep build | Main platform, domain preview and scoped media CORS templates compiled | Syntax/type checks, not a deployment or app build. |
| `pnpm typecheck` | All 11 tasks passed | Existing generated client; no application source changed. |
| `pnpm lint` | All four tasks passed; zero errors, existing warnings retained | No unrelated warning cleanup. |
| Documentation and whitespace | Documentation checker and `git diff --check` passed | Offline links/contracts and patch whitespace only. |

## Azure execution and recovery

Subscription `c710b26f-e3c7-4a45-9477-eaaf3bdcc329` was confirmed Enabled;
resource group `rg-genealogiq-prod`, environment `cae-genealogiq-prod`.
The eight A/CNAME/TXT records matched Azure-discovered values on both
`1.1.1.1` and `8.8.8.8`. The environment IP was `20.197.202.148`.
All generated endpoints passed live/ready before the cutover.

The scoped domain what-if succeeded with only the three expected existing
Container Apps modified. This template was used for preview, not deployed;
targeted CLI commands applied hostnames/certificates and URL environment values.
No image build, secret rotation, database migration, data rewrite or job
execution was part of this configuration-only change.

Certificate issuance took several minutes. BMS/SEQ were issued in parallel
while the first cutover waited on www. The initial script's stale discovery
then tried to add the already-added BMS hostname and stopped before origin
updates. The script now refreshes bindings immediately before hostname actions;
the regression test models completion during a wait. Rerunning completed the
cutover, retaining existing bindings. A further real `-Apply` rerun succeeded
with ready latest revisions and unchanged configuration.

An early attempt to PATCH the Blob service returned HttpResourceNotFound
(unsupported operation); it did not apply CORS. The scoped Bicep what-if then
showed only the expected Blob service modification, and deployment
`genealogiq-domain-media-cors` succeeded. Versioning remained enabled, with
14-day blob and container delete retention. No blob was uploaded or deleted.

## Final runtime evidence

| Hostname | App / ready revision | Managed certificate | HTTPS result |
| --- | --- | --- | --- |
| `genealogiq.com.br` | APP / `ca-genealogiq-app-prod--0000007` | `mc-cae-genealogiq-genealogiq-com-b-7746` | live 200, ready 200 |
| `www.genealogiq.com.br` | APP / same revision | `mc-cae-genealogiq-www-genealogiq-c-9698` | live 200, ready 200 |
| `bms.genealogiq.com.br` | BMS / `ca-genealogiq-bms-prod--0000007` | `mc-cae-genealogiq-bms-genealogiq-c-6707` | live 200, ready 200 |
| `sequoia.genealogiq.com.br` | SEQ / `ca-genealogiq-seq-prod--0000007` | `mc-cae-genealogiq-sequoia-genealog-8211` | live 200, ready 200 |

All certificates reported `Succeeded` and all hostname bindings were
`SniEnabled`. Plain HTTP returned 301 to HTTPS for the same hostname. This
does not add a www-to-apex content redirect.

All three apps expose these shared runtime origins:

- `APP_URL=https://genealogiq.com.br`
- `BMS_URL=https://bms.genealogiq.com.br`
- `SEQUOIA_URL=https://sequoia.genealogiq.com.br`

Per-app `AUTH_URL` is the respective canonical origin. Independent HTTP reads
of `/api/auth/providers` verified Credentials callback URLs at those origins,
including the apex callback when requested via www. The SEQ rollout initially
returned its older callback while its new revision was starting; verification
was repeated only after latest and latestReady matched. A regression test now
rejects treating an older healthy revision as completed cutover evidence.

Immutable images were independently checked unchanged:

- APP: `genealogiq-app:035368388fa3b6a9f2982ce5fec767061ba8c251`
- BMS: `genealogiq-bms:6e06634a752b44bce24825b0aa25baf0b669fa16`
- SEQ: `genealogiq-seq:6e06634a752b44bce24825b0aa25baf0b669fa16`

Storage PUT OPTIONS preflight returned 200 with an exact matching Allow-Origin
for all four new website origins, and 403 for `https://unauthorized.example`.
This verifies CORS allow/deny behavior, not a production SAS upload.

The existing daily and migration executions were already Succeeded and were
not rerun. All eight metric alerts were enabled. PostgreSQL was Ready with
public network access Disabled and 14-day backups. The daily scheduler retains
its generated BMS endpoint and needs no DNS migration.

## Browser and local product evidence

Production browser: APP marketing homepage rendered at the new apex. After
the new revisions were ready, anonymous APP `/home` and BMS/SEQ `/dashboard`
requests rendered their sign-in pages at the new hostnames. No production
account sign-in, customer mutation, mail or financial operation was performed.

The three-app local baseline used `scripts/local-qa.mjs`, loopback PostgreSQL
and disabled external providers. Each app used its normal fixture Credentials
sign-in rather than a forged session:

- APP: removed Rex from favorites, re-added it, and reloaded. Family-tree
  inspection showed seven humans, four generations and two pets; zoom/fit and
  Rex search were exercised. Sign-out followed by `/home` showed sign-in.
- BMS: saved a temporary company trade name, reloaded, then restored
  `Genealogiq Local`. Anonymous company-edit access after sign-out redirected
  to sign-in.
- SEQ: saved/reloaded the tenant trade name, then restored `Local Tenant`;
  anonymous company-edit access after sign-out redirected to sign-in.

Independent local DB checks confirmed restored company/tenant values and
favorite count one. The owned launcher/session and its app children were
stopped; ports 3000/3001/3002 no longer listened. Existing PostgreSQL/Azurite
services were retained. Browser observations are live manual evidence, not
saved screenshots or an automated end-to-end suite.

## Remaining integration limits

- Hostinger: no additional record change is needed. Keep routing and ownership
  records in place for managed certificate renewal; preserve email records.
- Google: live provider discovery exposed only Credentials. Google OAuth is
  not verified/enabled by this DNS change, despite the consumer UI button.
  Configure the client/Key Vault credentials and new authorized callbacks if
  Google login is required; do not count the sign-in screen as OAuth proof.
- Stripe, Turnstile, mail and other provider accounts require the external
  settings in the [integration checklist](../AZURE-DEPLOYMENT.md#external-integration-checklist)
  when enabled. No provider account, webhook signing secret or mail DNS was
  changed, and checkout/payment/delivery remain n/a for this task.
- The existing marketing portal link still targets `https://sequoia.rip/sign-in`;
  edit/rebuild/deploy it before retiring the legacy domain. Runtime origins
  do not rewrite browser bundles or persisted QR/profile URLs.
- Local upload forms, production Credentials login and production tenant/role
  mutations were not exercised; their product prerequisites remain separate.

Ignored local CLI evidence includes `.azure/domain-cutover-final.json`,
`.azure/domain-cutover-apply.log`, `.azure/domain-cutover-rerun.log`,
`.azure/domain-cutover-what-if.json`, and `.azure/domain-tests.log`.
These are optional local artifacts, not required tracked documentation links.
