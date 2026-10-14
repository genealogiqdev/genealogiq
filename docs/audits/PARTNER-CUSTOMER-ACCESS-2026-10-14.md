# Partner customer access and GenCode accounting — 2026-10-14

## Request and approved rule

The user requested direct Premium access during Sequoia customer registration, easy SEQ/BMS access controls, automatic stock accounting for a confirmed sale, and a simple BMS view of funeral-home GenCodes. They explicitly approved: **GenCode vendido + Premium por 12 meses** consumes one code; **Somente cadastro** preserves inventory; subsequent Premium activation/deactivation never changes the recorded sale.

The work stays on the starting `main` branch. It started at `58d4145`; subsequent independent shared-workspace commits include partner sidebar/email fixes, disk documentation and the SEQ package storefront (`930ad50`). Relevant source since the feature documents' previous revision includes `462f8a9`. Existing APP place-QR work and other tasks' changes are preserved. No Git push, cloud deployment, real checkout or external message was performed.

## Source evidence

- [SEQ customer actions](../../apps/seq/src/actions/customer.actions.ts) parse the explicit onboarding choice and commit account, hashed setup token, optional memorial and identified sale together. The optional blank physical-code field means automatic allocation; an exact code selects an existing plaque. Email runs after commit with a pending-success result on failure.
- [The shared partner service](../../packages/services/src/partner-consumer-access.ts) locks the scoped customer/code, reserves one credit inside the caller transaction, creates a finite zero-value Premium AppSale and audited ConsumerAccessGrant, records SOLD/buyer/operator/time and queues the existing outbox receipt. [The credit API](../../packages/services/src/credits.ts) accepts an optional transaction and clamps calendar-month expiry using the shared helper.
- [SEQ access actions](../../apps/seq/src/actions/customer-access.actions.ts) and [BMS partner actions](../../apps/bms/src/actions/partner-consumer.actions.ts) enforce live administrative scope. Both use the same finite grant and exact named revocation. They preserve customer affiliation, purchased periods and GenCode sales. The existing independent BMS gift workflow retains its separate tenantless boundary.
- [The shared confirmation](../../packages/ui/src/components/premium-access-control.tsx) names the recipient, allows cancel, keeps an error visible and retains the request UUID across a failed retry. Customer lists/detail show the current plan/expiry and sold count. Existing customers can record a sale for their actual delivered code.
- [SEQ inventory](../../apps/seq/src/queries/licenses.ts) counts sold units by durable sale time. [BMS overview](../../apps/bms/src/queries/partner-gencodes.ts) includes all tenants, measured zero stock, available/sold/activated/pending units and last sale; query failures propagate. Its exact-tenant customer link preserves filtering through search/pagination.
- APP's three locale gift labels now say granted Premium without assuming Genealogiq was the grant source. Live AppSale/Subscription entitlement resolution is reused. Premium itself does not mark a plaque activated or grant extra memorial capacity beyond the plan's existing quotas.

There is no schema migration in this feature. Existing consumer-grant, revocation and email-outbox migrations are required. Historical registrations are not inferred to be sales; operators use the explicit existing-customer sale action.

## Automated test evidence

| Check | Observed result | Scope / limit |
| --- | --- | --- |
| `pnpm test` | 146 files / **1,359 tests passed**; 8 files / 51 opt-in cases skipped | Full shared working tree, including concurrent work. Skips are not passes. |
| Partner service unit suite | **15 passed** | Calendar/leap-day dates, paid/test allowance distinction, active grant/request deduplication, recurring conflict, named/stale revocation, tenant/recipient boundaries, single reservation/outbox and SOLD/ACTIVATED retries. |
| Partner service PostgreSQL suite | **7 passed**, explicitly enabled | Blank-field allocation; account/token/sale/credit/access/outbox persistence; last-unit race; no-credit rollback; final-audit failure rollback; retry after revoke; paid time and replacement grant preservation; other-tenant rejection. |
| Targeted SEQ/BMS action/query/guard checks | **46 passed** in seven files | Scoped actions, permission changes, translation/validation and email-pending success. Included in the full suite. |
| Shared Premium confirmation through BMS | **3 DOM tests passed** | Real Dialog/portal cancel, exact confirmed gift and stable retry ID. This is happy-dom component evidence, not Chrome visual acceptance. |
| Prisma generation | Passed before type/build checks | Canonical client generated once explicitly; the initial normal Turbo typecheck also ran its declared generation dependency. |
| Final serialized typecheck | **10 tasks passed** | `pnpm exec turbo run typecheck --only --concurrency=1`; no concurrent generation. |
| Serialized lint | **3 app tasks passed**, zero errors | APP 8 warnings, BMS 21, SEQ 20; existing unused-variable/React-library warnings. |
| Sequential provider-disabled production builds | **SEQ, BMS and APP passed** | Isolated `.next-qa-partner-customer-20261014`; page-generation entries 27/27, 35/35, 33/33 respectively. Includes build TypeScript checks. |
| Schema/migration/locale gates | **Passed** | One canonical schema, 78 ordered migrations, all nine locale files in parity, zero static i18n-key errors (95 dynamic calls skipped, one unmapped columns file). |
| Documentation and whitespace | **Passed** | Four guides, 40 features and local references validated; `git diff --check` passed. |

The PostgreSQL run uses only `genealogiq_coupon_qa_partner_customer_20261014` on loopback. This is a disposable copy of the local fixture database. Initially the copy and normal local database lacked the existing `20261009010000_consumer_access_revocation` and `20261009020000_email_outbox` changes. After applying those existing migrations locally, all seven cases passed. The rollback assertion checks the intentionally injected constraint by name, preventing a missing-schema error from masquerading as a successful rollback test.

Initial runtime found that a blank string reached SQL as an exact empty code instead of automatic selection. The service now normalizes blank/whitespace to no selection; the real PostgreSQL registration fixture explicitly submits an empty string. The full runtime then passed. The first confirmation DOM run needed the shared component's explicit React namespace import for the BMS test transform; the corrected component passed all three cases.

## Local runtime and persistence evidence

Only loopback PostgreSQL and provider-disabled local products were used. Each product used normal Credentials login and its own application session. HTTP requests invoked the compiled Server Actions through the normal Next protocol and rendered routes; no session guard or actor/tenant check was bypassed. Saved local evidence is under `.local-qa/partner-customer-2026-10-14/`; session cookies, password hashes and auth secrets are not written into tracked evidence.

| Product / scenario | Expected and observed |
| --- | --- |
| SEQ: initial tenant with 400 funded codes, plain registration | **400 available / 0 sold / 0 activated**, invitation token persisted; mail pending with providers disabled. |
| SEQ: new customer, blank-code sale plus Premium | **399 / 1 / 0**, one held identified reservation, one setup token, finite expiry **2027-10-14**. Account, sale, grant and receipt persisted together. |
| SEQ: duplicate registration and unavailable specific code | Both rejected; stock remains **399 / 1 / 0**; unavailable-code registration leaves no new account. |
| SEQ: revoke/regrant and stale original confirmation | Complimentary sale canceled/new gift active; original confirmation cannot cancel replacement; stock remains **399 / 1 / 0**. |
| SEQ: existing customer's identified sale, then repeat | **398 / 2 / 0**, with no second spend or extra gift on retry. Reloaded list displays plan and GenCodes sold. |
| SEQ: ordinary tenant USER | Grant action returns **403**, with no mutation. |
| BMS: filtered per-funeral-home report | Exact table values **398 available / 2 sold / 0 activated / 2 pending**, correct company-customer link and exact tenant directory filter. |
| BMS: revoke and new grant | Finite replacement, platform actor recorded; **398 / 2 / 0** unchanged. |
| BMS: ordinary internal USER | Report renders Next's forbidden boundary and no partner rows; server mutation returns **403** and leaves the grant intact. The streamed report shell may have HTTP 200 before its forbidden boundary, so body and data absence were checked separately. |
| APP: final customer's normal Credentials login | `/subscriptions` and reload show **Premium liberado**, **sem cobrança**, and finite **2027-10-14** expiry from the grant made in BMS. |

The welcome token's atomic persistence and email-pending behavior were checked. For the independent APP login, the synthetic customers were assigned the documented disposable local fixture password hash; this does not establish external mailbox delivery or exercising a received setup link. One earlier failed blank-code attempt left its synthetic tenant/plain customer with unchanged 400 stock; local audit/ledger fixtures are retained, never rewritten as production evidence.

## Browser UI and provider limits

Chrome integration was selected explicitly. Both inventory/connection and tab creation attempts failed with **Codex auth token is unavailable**. No in-app browser fallback was used. The user was asked to reconnect; visual acceptance remains **n/a**, not a pass. Remaining browser scenarios are: operate both onboarding radio options through all four steps, inspect layout, cancel/confirm/retry Premium in each app, select an existing physical code and reload the inventory/report. DOM tests and HTTP-rendered text do not prove pixels, hydration or these manual interactions.

External Resend, Stripe, Google and push credentials were disabled. Provider acceptance/inbox placement, real payment and production customer/data behavior were not tested or changed. The code/credit tests do not establish the broader activation/daily-reconciliation scenarios in existing feature gaps.

## Runtime recovery and cleanup

The first attempt to run all three products together hit Windows error 1450 (insufficient resources) while APP Turbopack wrote source maps. The owned launcher and its children were stopped. Running one product at a time with `RAYON_NUM_THREADS=2` completed all named runtime scenarios; SEQ used port 8002, BMS 8001, APP 8000. Each owned launcher was stopped after its checks. This environment failure is retained separately from the subsequent passing runtime.

Final builds exited successfully after 169 seconds (SEQ), 163 seconds (BMS) and 174 seconds (APP). Local QA mode deliberately omits standalone copying; this is not a clean production-container packaging or deployment check. Sentry emitted its existing configuration deprecation warning in BMS/SEQ.

The disposable PostgreSQL database and `/tmp/partner-customer-20261014.dump` were removed after the tests; a catalog query confirmed zero databases with that exact name. The normal local fixture database and its audit/ledger records were retained. Shared compose PostgreSQL/Azurite remain available for the workspace. No owned product server remains listening on 8000/8001/8002; the build process and its children exited.

Only this task's 8000/8001/8002 and dated-build includes were removed from app tsconfigs; other settings and the pre-existing APP 4400 includes were preserved. The six ignored generated output directories were retained because they contain links; no recursive removal was performed across linked dependencies. Logs, synthetic fixture metadata and HTTP evidence remain in the ignored QA folder. Unrelated working-tree edits are excluded from this feature's commit.

## Related feature contracts

[SEQ customers](../../apps/seq/docs/CUSTOMERS-MEMORIALS.md) · [SEQ inventory](../../apps/seq/docs/GENCODE-OPERATIONS.md) · [BMS consumers](../../apps/bms/docs/CONSUMERS.md) · [BMS reporting](../../apps/bms/docs/REPORTING.md) · [Shared credits](../PARTNER-CREDITS.md) · [APP billing](../../apps/app/docs/BILLING-QUOTAS.md)
