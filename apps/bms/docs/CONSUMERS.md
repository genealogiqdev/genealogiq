# APP customer directory, direct registration and Premium gifts

> **Code:** [consumer actions](../src/actions/consumer.actions.ts) · [schema](../src/schemas/consumer.schema.ts) · [directory queries](../src/queries/consumers.ts) · [form](../src/components/consumers/consumer-form.tsx) · [revocation confirmation](../src/components/consumers/consumer-revoke-button.tsx) · [platform guard](../src/lib/consumer-access.ts) · [atomic gift/revocation](../../../packages/services/src/consumer-access.ts)
> **Entry points:** BMS **Clientes → Clientes finais** (`/consumers`), the **Clientes finais** shortcut on `/customers`, and `/consumers/new` for direct registration; eligible independent accounts can be selected from the directory.
> **Depends on:** [AUTHENTICATION](../../../docs/AUTHENTICATION.md) · [EMAIL-DELIVERY](../../../docs/EMAIL-DELIVERY.md) · [APP ACCOUNTS](../../app/docs/ACCOUNTS.md) · [BILLING-QUOTAS](../../app/docs/BILLING-QUOTAS.md)
> **Last verified against code:** 2026-10-08 at `4eb3d5c` plus the expiry correction. See the [original consumer access audit](../../../docs/audits/CONSUMER-ACCESS-2026-10-07.md) and [expiry correction audit](../../../docs/audits/CONSUMER-EXPIRY-2026-10-08.md) for source, tests, runtime/UI and production evidence separately.

> **Directory source review:** 2026-10-09, global APP directory change. Automated tests and runtime/browser verification were omitted at the user's request; see the separate evidence below.

> **Revocation review:** 2026-10-09, starting at `01201a0` with the existing expiry correction in the working tree. Source, tests, runtime/UI and cleanup for **Desfazer Premium** are recorded separately in the [revocation audit](../../../docs/audits/CONSUMER-REVOCATION-2026-10-09.md). The verified-sender email fix at `4d1af78` is retained.

## How it works

The **Novo cliente** wizard at `/customers/new` also exposes **Guardião / Usuário Final** in **Segmento Genealogiq**. Selecting it uses the existing `ConsumerForm` and `registerConsumer` action. Its five steps are **Cliente final**, **Contato**, **Finalidade**, **Administrador / Guardião** (App access), and **Permissões Premium**. The third step stores an optional internal reason instead of collecting a partner address; the fourth reviews the same recipient's name and sign-in email; the fifth confirms the existing complimentary Premium year. `/consumers/new` retains its compact form and existing-account entry.

`getConsumers` reads every `APP_USER` after the live platform administrator guard. The directory includes accounts created through APP, BMS and any SEQ partner, with active/inactive filtering, partner search, the linked company and registration date. The existing independent Premium workflow below retains its original eligibility rules.

| Step | Boundary | Result |
| --- | --- | --- |
| 1 | `verifyConsumerAdmin` calls the BMS DAL and reloads the operator's activation, role and tenant scope | Active Genealogiq administrator; tenant OWNER/ADMIN and stale revoked sessions are rejected |
| 2 | `getConsumerSchema` normalizes names/email, bounds the optional internal note and validates a stable request UUID | Only the documented fields reach the service; actor, currency, locale and password hash come from the server |
| 3 | `grantConsumerPremium` serializes request/email and locks an existing AppUser | A new independent account or a compatible existing account |
| 4 | One transaction creates/updates access, creates the finite AppSale and records ConsumerAccessGrant | Usable Premium immediately, zero charge, no coupon or purchase |
| 5 | `sendConsumerPremiumEmail` runs after commit | Initial credentials for new login accounts, confirmation for existing accounts, or explicit pending-email state |
| 6 | APP sign-in and `/subscriptions` read the live entitlement | Premium quotas from the existing catalog, gift label, expiry and no automatic renewal |

No model/LLM or checkout step is involved.

## Rules and why

- Directory accounts are **AppUser**, role `APP_USER`, from every partner and from independent registration. The default list applies no tenant, creator, activation or email-presence restriction. Memorial, ghost and pet profiles remain excluded by role.
- Direct registration and Premium gifts remain limited to independent `APP_USER` accounts with `tenantId=null`. No Tenant, staff User, GenCode, credit, order or coupon is created. The gift's AppSale also has `tenantId=null`.
- BMS's Credentials and Google gates accept internal staff (`tenantId=null`) and platform `SUPER_ADMIN`. That platform role is not assignable in SEQ's staff schema. The new feature additionally reloads the operator on every request, rejecting an old tenant session, inactive operator or revoked admin privilege. Shared session-revocation limits elsewhere remain documented in AUTHENTICATION-G1.
- New accounts are active and email-verified by the administrative registration. Their generated random password has 144 bits of random input and is stored only as bcrypt at cost 12. Passwords never appear in browser results, tracked files or logs.
- Lookup is case-insensitive. Existing active independent accounts keep their ID, profile, name, password and Google identity. An old invitation with neither password nor Google receives its first password. An existing unverified account is verified as part of this administrative release. Inactive accounts, memorial/pet identities, ambiguous duplicate emails and tenant-owned accounts are rejected; no funeral-home association is removed.
- The catalog must have active code `PREMIUM`; its live quota fields remain authoritative. A price row, Stripe synchronization and the catalog's term length are not prerequisites: this gift always grants **12 calendar months**.
- An existing manually held Premium period is preserved: the gift adds 12 months after the latest unexpired compatible AppSale. Any live Stripe subscription or different active plan blocks a new gift, including shorter subscriptions hidden behind a later expiry. No Stripe billing/cancellation API is called.
- The [20260922010000 test migration](../../../packages/db/prisma/migrations/20260922010000_grant_premium_test_access/migration.sql) created zero-value Premium allowances until 2099. Only its exact `test-premium-<md5(AppUser.id)>` identity with zero value and no Stripe subscription is excluded from paid-through time. A new gift cancels that test sale in the same transaction and starts today, or after a genuine compatible paid/manual term. Unrelated complimentary sales and purchased periods are preserved; no general future-year cutoff is used.
- Replaying the request returns the original result. Re-registering the email while any earlier gift remains valid also keeps the original expiry, even under concurrent operators. A fresh request after expiry can grant a new year. A reused UUID with different submitted details is rejected.
- `AppSale.value=0`, active status, a finite `currentPeriodEnd` and `cancelAtPeriodEnd=true` make the gift available without renewal. APP's checkout entry rejects an overlapping live gift; the gift card does not offer another checkout.
- Account, sale and audit are atomic. Mail failure returns a successful registration with **email pending**. Retry only the email, preserving the password and Premium period. A resend creates a hashed 72-hour password setup link; it does not replace the current password.
- **Desfazer Premium** requires confirmation naming the recipient and the same live platform administrator guard. It accepts the original gift ID, not an arbitrary AppSale or the latest gift for an email. Independent `APP_USER` recipients may have a gift revoked even if inactive or without an email; partner-owned and non-consumer recipients remain outside this workflow.
- Revocation ends only the live, zero-value Premium sale recorded by that gift, without Stripe/payment/coupon links. Its sale status becomes `canceled` and `canceledAt`/`endedAt` record the current instant. Every other sale remains untouched: valid paid time remains effective; otherwise APP falls back to FREE. The canceled migration-origin test allowance is never restored.
- The original grant dates, reason, creator and email acceptance time remain. `revokedAt` and permanent `revokedById` record the cancellation in the same transaction as the sale; the account, password, profile and recovery links remain usable. Revocation sends no email and cannot recall an email already sent or in flight.
- Recipient row locking serializes grants and revocations. A duplicate revocation returns the first cancellation without changing its actor/time. An old grant UUID returns `grant-revoked`, while a fresh request can offer another finite year. A stale confirmation for the old gift cannot cancel the replacement.

## Contracts and data

`FINAL_CONSUMER` is a wizard choice, not a Tenant segment or a new authorization role. This branch collects only the consumer action's supported fields and never submits the partner form, tax identifiers, staff owner, modules or initial GenCodes. The partner action continues to reject that segment. “Guardião” describes the person receiving App access; registration does not assign guardianship over an arbitrary existing profile. The App's existing profile authorization still applies.

`registerConsumer` accepts `{ requestId, firstName, lastName, email, notes? }`. Names are required and at most 100 characters each, email at most 320, internal note at most 500. It returns `ActionResult<{ appUserId, expiresAt, alreadyGranted, emailPending }>`; no credential or password hash is returned.

`resendConsumerAccessEmail(appUserId)` requires the same live platform guard and an active independent APP_USER with an unexpired gift and an unexpired active/trialing AppSale. The recipient is read from the database, never from the resend form. Email acceptance sets `emailSentAt`; a failure does not change the entitlement.

`revokeConsumerAccess(grantId)` validates a nonblank ID of at most 128 characters and derives the actor from the verified session. `revokeConsumerPremium` reloads the gift/recipient/sale after locking the stored recipient, rejects expired, detached, paid or otherwise changed sales, and returns an idempotent result. The action returns `ActionResult`, refreshes `/consumers` after success and exposes only translated failures. Resend and active-gift lookup exclude revoked records, and the directory checks the sale's real status/expiry before offering resend/revoke.

`getConsumers(query?, page?, status?)` searches first name, last name, email and the linked partner's legal/trade name without case sensitivity, and paginates 25 rows. `status` accepts `all` (default), `active` or `inactive`; unknown values fall back to `all`. Counts and rows share the same filters. The search and status survive pagination, and submitting filters starts at page one.

The directory shows name/email, account activation, partner affiliation, registration date, current plan/expiry and the latest gift email state. Activation is shown separately from the plan so an inactive account can still have a recorded subscription. Missing email does not hide an APP_USER. The company is the current affiliation, not an inferred registration source; a tenantless account is not automatically labeled as created in APP or BMS.

Only the needed display fields are selected, never passwords or Google identifiers. Name/email share a wrapping cell, and the gift delivery state sits below the plan. A revoked gift instead shows **Presente Premium desfeito em** with its cancellation date. Partner names link to their BMS company record. Gift/resend buttons appear only for active independent accounts with an email; a live gift also offers revoke for independent inactive/email-less accounts. The actions wrap inside the table cell. `getConsumerForRegistration`, grant, resend and revoke retain their own privileged, tenantless checks. Global directory access does not itself change access, detach a partner, alter a customer's status or change SEQ scope.

| Model/table | Purpose |
| --- | --- |
| AppUser / `app_users` | All APP_USER identities in the directory; direct gifts use independent accounts. `createdById`, when populated, identifies the registering staff member |
| Tenant / `tenants` | Current partner affiliation, displayed and searchable without filtering the global directory to one tenant |
| Subscription / `subscriptions` | Active Premium catalog and current quotas |
| AppSale / `app_sales` | Finite zero-value Premium access; `soldById` records the operator |
| ConsumerAccessGrant / `consumer_access_grants` | Unique request/hash, permanent recipient/result IDs, operator, original start/expiry, optional note, email acceptance time and paired revocation time/operator |
| PasswordResetToken / `password_reset_tokens` | Hashed 72-hour resend link scoped to AppUser |

The additive [migration](../../../packages/db/prisma/migrations/20261007010000_consumer_access_grants/migration.sql) creates one table and indexes. It changes no existing rows or columns and remains compatible with the previous application revision. Consumer/sale deletion nulls audit relations; the permanent IDs, request hash and grant dates remain. A deleted account cannot be recreated by replaying its original request.

The additive [revocation migration](../../../packages/db/prisma/migrations/20261009010000_consumer_access_revocation/migration.sql) adds nullable `revoked_at`/`revoked_by_id` and a CHECK requiring both to be null or both populated. Existing gifts remain unrevoked. Like `createdById`, the revoking operator ID is permanent audit text and is not removed on staff deletion. Apply the migration before deploying the new consumer queries.

## How to test it (AI-runnable)

Run from the repository root with installed dependencies. Generate Prisma and run compile/lint/build checks sequentially.

| Layer | Command / scenario | Evidence |
| --- | --- | --- |
| Deterministic | `pnpm test` | [service cases](../../../packages/services/src/consumer-access.test.ts), [action cases](../src/actions/consumer.actions.test.ts), [directory scope](../src/queries/consumers.test.ts), [current platform privilege](../src/lib/consumer-access.test.ts), email and APP checkout cases |
| PostgreSQL | Set `CONSUMER_ACCESS_TEST_DATABASE_URL` to a disposable loopback `genealogiq_coupon_qa_*` copy, then `pnpm exec vitest run --project services packages/services/src/consumer-access.integration.test.ts` | Nine real transaction cases: exact period, concurrent requests, existing account, tenant rejection, hidden Stripe conflict, final-audit rollback, deletion history, request mismatch and post-expiry renewal |
| Revocation | In that disposable copy, apply the revocation migration and run `pnpm exec vitest run --project services packages/services/src/consumer-revoke.integration.test.ts` | [Real transaction cases](../../../packages/services/src/consumer-revoke.integration.test.ts) cover paid/FREE fallback, old test-sale removal, audit preservation, simultaneous operators, new/stale requests, recipient/provider boundaries and rollback. [Service](../../../packages/services/src/consumer-revoke.test.ts), [action](../src/actions/consumer-revoke.actions.test.ts) and [confirmation](../src/components/consumers/consumer-revoke-button.test.ts) tests cover validation, current privilege and cancel/error UI behavior. |
| Contracts | Schema/migration/i18n checks and `node scripts/check-docs.mjs` | Source shape and references only |
| Product | BMS + APP through [LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md) with a loopback mail capture | Normal admin login → create independent family → use captured credentials on APP → Premium gift/expiry survives reload |
| Boundary | Repeat the same email; simulate Resend rejection and retry; sign in as non-admin and tenant staff | No duplicate year, explicit pending mail, unchanged password and permission rejection |

The integration suite refuses deployed hosts and the normal local database. Prepare a disposable copy as described in [TESTING](../../../docs/TESTING.md), apply the new migration there, and remove only that database after testing. The suite intentionally adds/removes a temporary constraint inside that disposable database to prove rollback after the final audit write fails. Do not run it on shared data.

**Expected answers:** Dates are literal assertions, including 2026-10-07 → 2027-10-07 and leap-day 2028-02-29 → 2029-02-28. A customer's manually paid end of 2026-12-15 must become 2027-12-15 for the first gift; a second registration keeps that end. Local live UI dates follow the actual registration instant and use the existing UTC billing-date display convention.

**Acceptance:** One independent active/verified account, one zero-value gift sale and one audit; the initial password reaches APP and Premium survives reload. Database counts and expiry must remain unchanged after duplicate registration or email retry. Tenant staff and non-admin users cannot list or grant consumer access.

For revocation, canceling the confirmation changes nothing. Confirming leaves one canceled gift sale and its original audit with cancellation metadata. Purchased Premium through **2027-01-31** stays effective through that exact date; an account with only the gift becomes FREE. Refreshing BMS/APP and retrying must preserve those results. Offering a new gift after cancellation must neither extend the canceled year nor let an old confirmation remove the new gift.

**Telling failures apart:** Missing local DB/Premium fixtures are prerequisites, a rejected transaction is a registration failure, and mail rejection after commit is pending delivery with access already active. The production mail provider and Google account flow require dedicated external fixtures; a captured email is not proof of inbox delivery.

### Manual scenarios

0. Open `/customers/new` and select **Guardião / Usuário Final**. Expect a fixed **Pessoa física** type, App-oriented steps 4/5 and no CPF, partner address, initial GenCodes or Sequoia modules. Validate empty/whitespace names and an invalid email before advancing, enter a reason, review the guardian and complete Premium. Reload the directory and independently verify one tenantless APP_USER, one finite zero-value sale and one audit with the reason, with no staff User/Tenant creation. Repeat the email and expect no extra year. Switch back to a partner segment and confirm the existing Sequoia steps remain.

1. Sign in through the normal BMS form as the local platform administrator. Create a unique `@genealogiq.test` family with the loopback capture configured. Use its captured password on APP; check Premium, expiry and reload, then independently query the account, sale and audit.
2. Repeat the email with uppercase characters and different names. Expect the original account, one gift and unchanged expiry. Select a separate manually paid Premium customer and check that the first gift preserves the old paid-through date.
   For the expiry regression, include the exact migration-origin test sale ending on 2099-12-31. A release on 2026-10-08 must end on 2027-10-08; a real paid end of 2026-12-15 must instead produce 2027-12-15. The old test sale must stop being active, and the directory/APP must agree after reload.
3. Reject mail in the local capture. Expect released access with pending mail; restore capture and resend. Check the hashed recovery token, unchanged password/expiry and one gift.
4. Sign in as tenant OWNER and expect rejection from BMS. Sign in as an internal USER and expect 403 on `/consumers`. Use the scoped unit cases for stale/deactivated/revoked sessions without minting browser sessions.
5. For the global directory, prepare APP-created and BMS-created accounts, customers of two different SEQ partners, an inactive account and an APP_USER without email. All must appear by default; memorial/pet profiles must not. Filter active/inactive, search a partner's legal/trade name and paginate/reload with the filters retained. Check the company, date and status against the stored rows. Partner/inactive/email-less accounts must not offer independent gift/resend actions. This scenario was documented but not executed in the 2026-10-09 source-only task.
6. For an independent customer's live gift, open **Desfazer Premium** and first choose **Manter Premium**; reload and verify no change. Confirm the cancellation, check the cancellation date and disappearance of resend/revoke, and reload APP to verify FREE or the original paid-through period. Try a stale resend/revoke from an already open page, then offer a fresh gift and verify that the old confirmation cannot revoke it. Check the stored sale/audit and unchanged account/password separately. An internal non-admin must be rejected; repeat with an inactive independent recipient to verify revoke remains available while grant/resend do not.

### QA evidence

The [2026-10-07 consumer audit](../../../docs/audits/CONSUMER-ACCESS-2026-10-07.md) records 969 passing deterministic tests, nine real PostgreSQL cases, browser screenshots and independent persistence checks. Real inbox placement/Google are n/a; final compile, cleanup and production results are kept separately in that audit.

## Runbooks

For a new B2C customer from **Clientes → Novo cliente**, choose **Guardião / Usuário Final**, enter the account holder's name/email and an optional reason (gift, tribute or faster profile access). Review the App recipient in step 4 and conclude **Cadastrar e liberar Premium** in step 5. Use the success screen's **Ver clientes finais** and email retry when needed. The new wizard shares all gift, duplicate, provider-failure and privilege rules below.

Open **Clientes → Clientes finais**, or use **Clientes finais** on the existing Clients page, to consult all registered APP customers. Use **Ativos e inativos**, **Conta ativa** or **Conta inativa** and search by name, email or partner company. A company's link opens its existing BMS record.

1. Open **Clientes → Clientes finais → Cadastrar cliente** for a new independent account. Enter name, surname and the final customer's email; optionally record an internal reason. The form grants 12 months of Premium immediately.
2. For an existing independent account, use **Liberar Premium** in the directory or enter the same email. A currently valid gift keeps its expiry. Existing paid Premium days are preserved for a first gift.
3. If mail is pending, use **Reenviar e-mail** after checking the shared mail provider. Do not create another registration. The APP's normal **Esqueci minha senha** remains available.
4. To remove a complimentary gift, choose **Desfazer Premium** beside **Reenviar e-mail**, review the named recipient and confirm. The account remains; only that gift ends. Refresh to see the cancellation date and, for an eligible active recipient, **Liberar Premium** for a new gift. Previously sent mail remains in the recipient's inbox.
5. For a partner-owned account or live recurring subscription, resolve the existing customer/billing relationship through its owning workflow. These actions neither detach a funeral home nor cancel billing.
6. Production delivery uses the existing Azure workflow: migrate once, deploy the immutable SHA images, then verify all app readiness endpoints. Do not issue live gifts, revocations or mail to real customers solely for deployment verification.

### Correct historical test dates

Use the [private database access runbook](../../../docs/AZURE-DATABASE-ACCESS.md#correct-legacy-premium-test-expiry) and [guarded repair](../../../scripts/azure/repair-premium-test-expiry.cjs). It previews only independent APP_USER migration-origin zero-value test sales still ending on the exact 2099 sentinel, then proposes 12 calendar months from their original creation. A BMS gift that inherited exactly 2099 → 2100 is corrected together with its AppSale to 12 months from its recorded creation, preserving another genuine compatible paid-through date. Tenant customers, payment-linked sales, coupon-linked test rows and lookalike IDs are excluded. Keep the backup, preview hash and before/after receipt; do not edit the applied historical migration or mask the dates in the UI.

## Gaps and fixes

### CONSUMERS-G5: No way to undo a complimentary Premium grant

- **Status:** fixed
- **Found:** 2026-10-09, request for **Desfazer Premium**; the email sender issue was already resolved in another session.
- **Evidence:** The directory offered only **Liberar Premium** or **Reenviar e-mail**, and the gift audit had no revocation metadata.
- **Impact:** An accidental gift could not be removed through BMS, and a naive sale cancellation would leave grant deduplication treating it as a valid gift.
- **Root cause:** The initial workflow implemented grant/delivery without a corresponding audited cancellation contract.
- **Resolution:** Added confirmed, platform-only revocation of the named zero-value gift, atomic sale/audit updates, safe retries and fresh grants after cancellation. Original paid time, identity and history remain. Independent service/action/confirmation and real PostgreSQL regressions accompany the change; runtime, persistence and cleanup are recorded in the [revocation audit](../../../docs/audits/CONSUMER-REVOCATION-2026-10-09.md).

### CONSUMERS-G4: BMS directory omitted partner customers

- **Status:** fixed
- **Found:** 2026-10-09, request for BMS visibility of all APP users regardless of registration source.
- **Evidence:** `getConsumers` required `tenantId=null` and a non-null email; the directory described only direct customers. SEQ's customer list was correctly limited to its own partner.
- **Impact:** BMS administrators could not see the complete APP customer registry, including partner-managed and legacy email-less accounts.
- **Root cause:** The independent Premium gift's recipient restrictions had also been applied to the administrative directory.
- **Resolution:** The global-directory change removes those read restrictions, retains the live platform guard and APP_USER role boundary, adds account status/company/date and status/company search, and exposes a Clients-page shortcut. Premium mutations retain their independent-account restrictions. Regression definitions in `consumers.test.ts` cover default scope, active/inactive filters, partner search and permission rejection; they were not executed, and runtime/UI verification was omitted at the user's request.

### CONSUMERS-G1: No direct independent customer gift flow

- **Status:** fixed
- **Found:** 2026-10-07, requested onboarding simplification for legacy families.
- **Evidence:** BMS exposed partner registration and coupon settlement for an existing APP user; neither created an independent consumer with a Premium gift.
- **Impact:** The team could not finish the family's account and complimentary year in one BMS operation.
- **Root cause:** Registration belonged to APP/SEQ, while BMS's consumer settlement required an existing identity and coupon.
- **Resolution:** Commit `8422e6c` adds the platform-only directory/form, atomic account/gift/audit writer, direct credential email with recovery, and APP gift presentation. Source/tests/UI and successful production release evidence are retained in the linked audit.

### CONSUMERS-G2: External mailbox and Google delivery path not exercised

- **Status:** open
- **Found:** 2026-10-07, direct consumer access verification.
- **Evidence:** Local provider capture/rejection validates message construction and initial password login; it does not observe a recipient inbox or Google OAuth.
- **Impact:** Production inbox placement and a real existing Google account remain integration prerequisites.
- **Root cause:** No dedicated external mailbox/Google fixture was supplied.
- **Resolution:** Use an authorized test recipient/provider account for that integration scenario. Keep local capture, provider acceptance and inbox delivery distinct.

### CONSUMERS-G3: Legacy test expiry was extended into 2100

- **Status:** fixed
- **Found:** 2026-10-08, user screenshots after the direct-access release.
- **Evidence:** A production read-only audit found 43 independent consumers with migration-origin 2099 test sales and one BMS gift starting in 2099 and ending in 2100. The original checks used ordinary finite manual sales and missed this historical fixture.
- **Impact:** Directory, success message and actual APP entitlement advertised decades of access instead of the intended year.
- **Root cause:** `grantConsumerPremium` treated every compatible manual AppSale as paid-through time, including the temporary test migration's sentinel.
- **Resolution:** This change excludes and atomically replaces that exact test allowance, with literal unit/PostgreSQL expectations for 2027, paid-period preservation and retries. The guarded repair corrects existing sale/audit dates together. The linked expiry audit records deployment, data correction, UI evidence and limitations separately.

## Verification log

| Date | Revision | Scope | Evidence / limits |
| --- | --- | --- | --- |
| 2026-10-07 | `b8afb94` + this change | Source and initial tests | Entry/DAL/schema/service/DB/mail/APP entitlement traced; initial 49 focused cases and nine disposable PostgreSQL cases passed. Final checks and UI evidence are recorded in the audit. |
| 2026-10-07 | Same change | Final local acceptance | 969 deterministic tests and nine enabled PostgreSQL cases passed; typecheck, lint, all three local builds and contract checks passed. Normal BMS/APP UI verified new/existing access, duplicate prevention, email failure/retry and permission boundaries; final directory screenshot and build-cache incident/cleanup are retained in the audit. |
| 2026-10-07 | `8422e6c` | Production release | CI and Deploy Azure completed successfully; migration execution succeeded; all three immutable images reached ready revision `0000011` with 100% traffic and six canonical HTTPS health checks passed. Anonymous `/consumers` rendered sign-in; protected gifts and inbox delivery were not exercised with real production customers. |
| 2026-10-08 | `4eb3d5c` + expiry correction | Legacy-date regression | 972 deterministic tests and 11 consumer PostgreSQL cases passed. The repair suite passed four database scenarios (five Node test entries including the parent), including stale-preview and transaction-failure rollback. Runtime/UI, private backup and production results are recorded in the expiry audit. |
| 2026-10-09 | `4eb3d5c` + global-directory change | Source | Traced APP/SEQ/BMS registration, APP_USER/Tenant relations, live administrator guard, global query, status/search/pagination and independent-gift boundaries. Reviewed the directory, Clients shortcut and all three locale changes; `git diff --check` passed (formatting only). |
| 2026-10-09 | Same change | Automated checks | Query regression definitions updated but not executed. No automated tests, typecheck, lint, build or docs validator run in this task; automated tests were waived by the user. |
| 2026-10-09 | Same change | Runtime / UI / persistence | n/a: omitted at the user's request. No app started, browser used, database/provider writes made or owned processes left running. |
| 2026-10-09 | `3826319` + consolidated release | Completion of interrupted wizard/revocation/expiry chats | Final deterministic and local PostgreSQL checks plus release evidence in the [consolidated audit](../../../docs/audits/PRODUCTION-RELEASE-2026-10-09.md). | Browser automated QA waived; production inbox acceptance remains separate. |

## Related

[PARTNERS](PARTNERS.md) · [DISCOUNT-COUPONS](DISCOUNT-COUPONS.md) · [ACCOUNTS-STAFF](ACCOUNTS-STAFF.md) · [APP billing](../../app/docs/BILLING-QUOTAS.md) · [EMAIL-DELIVERY](../../../docs/EMAIL-DELIVERY.md) · [DATABASE](../../../docs/DATABASE.md) · [TESTING](../../../docs/TESTING.md) · [Audit](../../../docs/audits/CONSUMER-ACCESS-2026-10-07.md)
