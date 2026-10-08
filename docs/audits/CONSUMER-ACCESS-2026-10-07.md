# Direct BMS consumer access — 2026-10-07

User-authorized scope: register final customers directly in BMS, without a
funeral-home association, give them 12 months of Premium, then commit and deploy
to production. This audit separates source, deterministic tests, database
integration, browser behavior and production evidence. Dates use the client's
2026-10-07 working date; some live fixture timestamps fall on 2026-10-08 UTC.

## Source and contracts

- Starting branch/revision: `main` at `b8afb94`. Rechecked affected auth, BMS and
  APP billing history since the earlier `6e06634` verification, including the
  intervening manual-coupon work and current uncommitted source.
- [CONSUMERS](../../apps/bms/docs/CONSUMERS.md) owns the new directory, form,
  server contract and operational instructions. `/consumers` and
  `/consumers/new` require an active platform administrator, checked against the
  current User row. Credentials and Google sign-in share the BMS staff gate.
- New accounts are active, verified `APP_USER` records with `tenantId=null` and
  a random bcrypt-cost-12 password. Existing compatible accounts retain their
  identity, profile, password and Google link. Active Stripe/different-plan
  subscriptions and tenant accounts are rejected.
- One transaction writes account access, a zero-value finite Premium AppSale
  and ConsumerAccessGrant. Request/email/row locks prevent concurrent duplicate
  gifts. Existing manually held Premium days are preserved. A currently valid
  gift cannot be extended by another registration or email retry.
- Email runs after commit. New login accounts receive credentials; existing
  accounts receive confirmation. Provider failure leaves successful access
  with an explicit pending state. Resend uses a hashed 72-hour recovery link,
  preserving the current password and expiry.
- APP reads the same live Premium quota model, shows the gift and expiry, and
  blocks overlapping checkout. No purchase, GenCode, coupon or funeral home is
  required. No billing provider mutation was introduced.
- The additive `20261007010000_consumer_access_grants` migration creates one
  audit table, indexes and optional SET NULL relations. It changes no existing
  rows or columns. Permanent recipient/result IDs survive account/sale deletion.
  Schema inventory: 45 models and 76 migrations.

## Deterministic and compile evidence

| Check | Observed result | Limit |
| --- | --- | --- |
| Initial focused service/action/query/email/APP checks | 49 passed | Mocked boundaries except actual password hashing |
| Full `pnpm test` | 111 files / 969 tests passed; four opt-in files / 22 tests skipped | Separate enabled consumer database suite below; no skipped case counted as a pass |
| Prisma generation | Passed, Prisma 7.9.1 | Local generated client |
| `pnpm typecheck --concurrency=1` | 11 tasks passed | Earlier integration-field and auth generic-inference errors were corrected before the successful run |
| `pnpm lint --concurrency=1` | Passed: zero errors, 51 existing warnings (APP 8, BMS 21, SEQ 22) | Existing hook/compiler/unused-variable warnings retained |
| Schema/migration guards | Passed; one schema and 76 ordered migrations | Source shape, not historical DDL replay |
| Locale parity/references | All nine locale files passed; zero missing references | 84 dynamic calls and one unmapped columns file remain outside the static gate |
| Documentation and whitespace | Passed after adding the required independent-expectation/manual-QA sections | Four guides, 40 indexed features; final counts recorded after audit completion |
| Bicep compile | Passed using the existing infrastructure source | No infrastructure deployment or replacement |
| Three sequential local production builds | Passed for APP, BMS and SEQ; each completed BUILD_ID/output configuration verified | Compile/prerender is distinct from the clean Linux standalone package |
| Final scoped lint | Passed without warnings/errors for all three changed Next configs and the final directory layout | Earlier complete lint retained its 51 existing warnings |

Independent expectations cover exact calendar-month/leap-day dates, existing
password/Google preservation, server-derived actor/role/tenant fields, current
platform privileges, finite zero charge, conflicting subscriptions, duplicate
requests, audit rollback/deletion, scoped directory queries and mail recovery.
The resend test also requires an unexpired underlying AppSale, not just an
unexpired audit date. Initial passwords are tested against the real bcrypt hash;
neither passwords nor hashes are returned to the browser.

### Local packaging incident and recovery

The first APP/BMS attempt compiled and type-checked, but BMS's standalone copy
recursively included previous QA standalone folders through workspace package
links. It reported `ENOSPC` and left the drive with zero free bytes. The shell's
eventual zero status did **not** establish build success: the actual log errors
were treated as a failed packaging check, and SEQ had not completed.

The owned build process had ended. Only this task's two
`apps/{app,bms}/.next-qa-consumer-build` output trees were removed. Each absolute
target was resolved inside this workspace, checked against links, and removed
without following symlinks. This restored about 4.46 GB of free space; older
outputs, dependencies, user files and shared Docker data were preserved.

After reading the installed Next 16.3.1 output guide, the three app configs were
adjusted so `LOCAL_QA_DIST_DIR` omits standalone copying. Their normal production
configuration still uses standalone. The clean Docker context excludes `.next`
and `.next-qa*`, and CI builds/starts that production package independently.
LOCAL-DEVELOPMENT-G2 retains the incident and recovery contract. The final local
runner also checks free space, completed BUILD_ID and output configuration after
each app instead of relying solely on a shell status.

The successful rerun is retained in `.local-qa/consumer-build-final.log`:
APP compiled in 88 seconds and type-checked in 44 seconds; BMS in 96/37.3
seconds; SEQ in 102/30.8 seconds. All three completed their page-generation and
final output checks without the standalone copy. Completed temporary build
outputs were removed after verification; about 4.25 GB remained free.

## Real PostgreSQL integration

The existing local PostgreSQL 17 container was used. An identified dump of the
normal local database was restored into the new disposable database
`genealogiq_coupon_qa_consumers_20261007`. The exact new migration SQL was applied
there and to the normal local database with stop-on-error transaction semantics.
This is incremental migration evidence; historical empty-database replay remains
the separate DATABASE-G1 gap.

With `CONSUMER_ACCESS_TEST_DATABASE_URL` explicitly targeting the disposable
loopback database, all **nine integration tests passed**. They verify a finite
gift without purchases, simultaneous requests, existing paid-period preservation,
tenant rejection, a shorter hidden Stripe subscription, induced failure at the
final audit insert rolling back all writes, retained audit after deletion,
conflicting request reuse, and a new gift only after expiry. The suite's dummy
hash is not evidence of a usable login; the normal browser scenario below is.

Raw local log: `.local-qa/consumer-integration.log`. These tests did not call a
cloud database, mail provider or Stripe.

## Runtime environment

The guarded local launcher ran APP at `127.0.0.1:5000`, BMS at `127.0.0.1:5001`
and SEQ at `127.0.0.1:5002`, using the loopback database and existing Azurite.
All three `/api/health/ready` endpoints returned 200/ready. SEQ was a dependency
readiness check; no changed SEQ user flow is claimed.

A loopback HTTP mail capture at port 5105 accepted only `@genealogiq.test`
fixtures. It intentionally returned provider rejection for the failure scenario.
Private captured JSON contains test credentials/tokens and stays ignored under
`.local-qa/consumers`; it is not source, an external message or inbox evidence.
Normal sign-in forms and real session cookies were used; no auth bypass or minted
JWT was used for browser acceptance.

## Manual browser and persistence evidence

| Scenario | Independently expected | Observed |
| --- | --- | --- |
| New independent family | One active/verified APP_USER, no tenant, one zero-value sale and one gift; initial credentials work | BMS created the family, APP normal Credentials login reached `/home`, `/subscriptions` displayed Premium and the gift through 8 October 2027; reload retained it |
| Uppercase duplicate email with different names | Same original account/name, one sale/gift, unchanged expiry | BMS reported the existing gift; PostgreSQL confirmed the original name and one sale/gift |
| Mail provider failure | Account/access remain usable; pending state does not invite re-registration | BMS displayed access released plus pending email; PostgreSQL showed one active gift and `emailSentAt=null` |
| Email retry after restoring capture | No extra year or password replacement; one hashed 72-hour token | UI changed to email sent, audit acceptance time was set, token hash matched privately, expiry and gift count were unchanged |
| Existing manually paid Premium | Preserve existing account/password and add exactly 12 months after the old paid-through date | Fixture's old end was `2026-12-15 12:00:00` UTC; gift ended `2027-12-15 12:00:00` UTC, original paid sale remained; old password still logged into APP and UI showed 15 December 2027 |
| Funeral-home OWNER at BMS sign-in | Reject even with valid credentials | Stored fixture password was privately verified before the normal form returned invalid credentials; no BMS session was granted |
| Internal USER without admin privilege | No customer directory access | Normal login succeeded; direct `/consumers` rendered 403 |
| Anonymous directory request | Require BMS sign-in | Redirected to the normal sign-in form |

Retained local fixtures are `consumer-direct@genealogiq.test`,
`consumer-fail-mail@genealogiq.test` and `consumer-existing@genealogiq.test`.
The first two raw expiry timestamps are respectively
`2027-10-08 00:37:48.342` and `2027-10-08 00:44:29.774` UTC. The existing customer's
original sale value is 150 BRL; its added gift value is zero. Database checks
confirmed `tenantId=null`, active/verified consumer status, audit counts and
unchanged existing password. No Tenant, staff User or GenCode purchase was
created by registration.

Screenshots are retained locally: [BMS directory](../../.local-qa/consumers/bms-directory.png),
[mail pending](../../.local-qa/consumers/bms-email-pending.png),
[duplicate](../../.local-qa/consumers/bms-duplicate.png),
[tenant denial](../../.local-qa/consumers/bms-tenant-denied.png),
[non-admin denial](../../.local-qa/consumers/bms-viewer-denied.png),
[APP Premium](../../.local-qa/consumers/app-premium.png) and
[existing APP Premium](../../.local-qa/consumers/app-existing-premium.png).

The final visual review wrapped long names, emails and plan labels to keep
registration/release/resend controls visible. A restarted BMS, normal
administrator sign-in and navigation through **Clientes → Clientes finais**
confirmed the saved customers and complete action labels in the
[final directory screenshot](../../.local-qa/consumers/bms-directory-final.png).
The header and table fit the ordinary browser viewport; the tab was then closed.

## Cleanup and preserved state

- Owned BMS/APP browser tabs were closed. After the continued turn, no listener
  remained on 5000/5001/5002/5105 and no consumer QA launcher process remained.
- The additional final visual session also ended; the next continued-turn
  process/listener check found no owned app process or listener on those ports.
- Existing shared PostgreSQL/Azurite containers and unrelated processes were
  retained. Local customer fixtures and their audit history remain available.
- The disposable database had zero connections and was dropped by its exact
  name. Its exact `/tmp/consumer-qa-20261007.dump` container file was removed;
  subsequent checks confirmed database count zero and the dump absent.
- Removed only this task's generated tsconfig include entries and restored the
  generated Next type references to the canonical `.next` directory. Each
  tsconfig retains its original 11-added/3-removed formatting diff. Pre-existing
  tsconfig formatting, `assets/` and `envs` changes are outside this commit.
- No owned build/dev process remains. Completed QA output directories were
  removed using verified workspace paths; test logs, screenshots and fixtures
  remain available, and shared Docker services were preserved.

## Production and remaining prerequisites

Production deployment is authorized by the user but was **not yet performed** at
initial audit creation. Record the exact source SHA, CI/deployment run, migration
job, immutable images, active traffic and public health checks here after release.
Do not interpret local readiness or capture as a production result.

Real recipient inbox placement and an existing Google account login remain
**n/a** without dedicated external fixtures (CONSUMERS-G2). No real customer was
registered or emailed for deployment testing. Old-session role changes are
covered by unit expectations; the browser tested normal tenant and USER paths.
Historical shared role revocation outside this feature remains AUTHENTICATION-G1.
