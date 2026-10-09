# APP customer directory, direct registration and Premium gifts

> **Code:** [consumer actions](../src/actions/consumer.actions.ts) · [schema](../src/schemas/consumer.schema.ts) · [directory queries](../src/queries/consumers.ts) · [form](../src/components/consumers/consumer-form.tsx) · [platform guard](../src/lib/consumer-access.ts) · [atomic grant](../../../packages/services/src/consumer-access.ts)
> **Entry points:** BMS **Clientes → Clientes finais** (`/consumers`), the **Clientes finais** shortcut on `/customers`, and `/consumers/new` for direct registration; eligible independent accounts can be selected from the directory.
> **Depends on:** [AUTHENTICATION](../../../docs/AUTHENTICATION.md) · [EMAIL-DELIVERY](../../../docs/EMAIL-DELIVERY.md) · [APP ACCOUNTS](../../app/docs/ACCOUNTS.md) · [BILLING-QUOTAS](../../app/docs/BILLING-QUOTAS.md)
> **Last verified against code:** 2026-10-07 at `8422e6c`. See the [consumer access audit](../../../docs/audits/CONSUMER-ACCESS-2026-10-07.md) for source, tests, runtime/UI and production evidence separately.

> **Directory source review:** 2026-10-09, global APP directory change. Automated tests and runtime/browser verification were omitted at the user's request; see the separate evidence below.

## How it works

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
- Replaying the request returns the original result. Re-registering the email while any earlier gift remains valid also keeps the original expiry, even under concurrent operators. A fresh request after expiry can grant a new year. A reused UUID with different submitted details is rejected.
- `AppSale.value=0`, active status, a finite `currentPeriodEnd` and `cancelAtPeriodEnd=true` make the gift available without renewal. APP's checkout entry rejects an overlapping live gift; the gift card does not offer another checkout.
- Account, sale and audit are atomic. Mail failure returns a successful registration with **email pending**. Retry only the email, preserving the password and Premium period. A resend creates a hashed 72-hour password setup link; it does not replace the current password.

## Contracts and data

`registerConsumer` accepts `{ requestId, firstName, lastName, email, notes? }`. Names are required and at most 100 characters each, email at most 320, internal note at most 500. It returns `ActionResult<{ appUserId, expiresAt, alreadyGranted, emailPending }>`; no credential or password hash is returned.

`resendConsumerAccessEmail(appUserId)` requires the same live platform guard and an active independent APP_USER with an unexpired gift and an unexpired active/trialing AppSale. The recipient is read from the database, never from the resend form. Email acceptance sets `emailSentAt`; a failure does not change the entitlement.

`getConsumers(query?, page?, status?)` searches first name, last name, email and the linked partner's legal/trade name without case sensitivity, and paginates 25 rows. `status` accepts `all` (default), `active` or `inactive`; unknown values fall back to `all`. Counts and rows share the same filters. The search and status survive pagination, and submitting filters starts at page one.

The directory shows name/email, account activation, partner affiliation, registration date, current plan/expiry and the latest gift email state. Activation is shown separately from the plan so an inactive account can still have a recorded subscription. Missing email does not hide an APP_USER. The company is the current affiliation, not an inferred registration source; a tenantless account is not automatically labeled as created in APP or BMS.

Only the needed display fields are selected, never passwords or Google identifiers. Name/email share a wrapping cell, and the gift delivery state sits below the plan. Partner names link to their BMS company record. Gift/resend buttons appear only for active independent accounts with an email; `getConsumerForRegistration`, the grant service and the resend action retain their own privileged, tenantless eligibility checks. Global directory access does not grant a gift, detach a partner, alter a customer's status or change SEQ scope.

| Model/table | Purpose |
| --- | --- |
| AppUser / `app_users` | All APP_USER identities in the directory; direct gifts use independent accounts. `createdById`, when populated, identifies the registering staff member |
| Tenant / `tenants` | Current partner affiliation, displayed and searchable without filtering the global directory to one tenant |
| Subscription / `subscriptions` | Active Premium catalog and current quotas |
| AppSale / `app_sales` | Finite zero-value Premium access; `soldById` records the operator |
| ConsumerAccessGrant / `consumer_access_grants` | Unique request/hash, permanent recipient/result IDs, operator, granted start/expiry, optional note and email acceptance time |
| PasswordResetToken / `password_reset_tokens` | Hashed 72-hour resend link scoped to AppUser |

The additive [migration](../../../packages/db/prisma/migrations/20261007010000_consumer_access_grants/migration.sql) creates one table and indexes. It changes no existing rows or columns and remains compatible with the previous application revision. Consumer/sale deletion nulls audit relations; the permanent IDs, request hash and grant dates remain. A deleted account cannot be recreated by replaying its original request.

## How to test it (AI-runnable)

Run from the repository root with installed dependencies. Generate Prisma and run compile/lint/build checks sequentially.

| Layer | Command / scenario | Evidence |
| --- | --- | --- |
| Deterministic | `pnpm test` | [service cases](../../../packages/services/src/consumer-access.test.ts), [action cases](../src/actions/consumer.actions.test.ts), [directory scope](../src/queries/consumers.test.ts), [current platform privilege](../src/lib/consumer-access.test.ts), email and APP checkout cases |
| PostgreSQL | Set `CONSUMER_ACCESS_TEST_DATABASE_URL` to a disposable loopback `genealogiq_coupon_qa_*` copy, then `pnpm exec vitest run --project services packages/services/src/consumer-access.integration.test.ts` | Nine real transaction cases: exact period, concurrent requests, existing account, tenant rejection, hidden Stripe conflict, final-audit rollback, deletion history, request mismatch and post-expiry renewal |
| Contracts | Schema/migration/i18n checks and `node scripts/check-docs.mjs` | Source shape and references only |
| Product | BMS + APP through [LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md) with a loopback mail capture | Normal admin login → create independent family → use captured credentials on APP → Premium gift/expiry survives reload |
| Boundary | Repeat the same email; simulate Resend rejection and retry; sign in as non-admin and tenant staff | No duplicate year, explicit pending mail, unchanged password and permission rejection |

The integration suite refuses deployed hosts and the normal local database. Prepare a disposable copy as described in [TESTING](../../../docs/TESTING.md), apply the new migration there, and remove only that database after testing. The suite intentionally adds/removes a temporary constraint inside that disposable database to prove rollback after the final audit write fails. Do not run it on shared data.

**Expected answers:** Dates are literal assertions, including 2026-10-07 → 2027-10-07 and leap-day 2028-02-29 → 2029-02-28. A customer's manually paid end of 2026-12-15 must become 2027-12-15 for the first gift; a second registration keeps that end. Local live UI dates follow the actual registration instant and use the existing UTC billing-date display convention.

**Acceptance:** One independent active/verified account, one zero-value gift sale and one audit; the initial password reaches APP and Premium survives reload. Database counts and expiry must remain unchanged after duplicate registration or email retry. Tenant staff and non-admin users cannot list or grant consumer access.

**Telling failures apart:** Missing local DB/Premium fixtures are prerequisites, a rejected transaction is a registration failure, and mail rejection after commit is pending delivery with access already active. The production mail provider and Google account flow require dedicated external fixtures; a captured email is not proof of inbox delivery.

### Manual scenarios

1. Sign in through the normal BMS form as the local platform administrator. Create a unique `@genealogiq.test` family with the loopback capture configured. Use its captured password on APP; check Premium, expiry and reload, then independently query the account, sale and audit.
2. Repeat the email with uppercase characters and different names. Expect the original account, one gift and unchanged expiry. Select a separate manually paid Premium customer and check that the first gift preserves the old paid-through date.
3. Reject mail in the local capture. Expect released access with pending mail; restore capture and resend. Check the hashed recovery token, unchanged password/expiry and one gift.
4. Sign in as tenant OWNER and expect rejection from BMS. Sign in as an internal USER and expect 403 on `/consumers`. Use the scoped unit cases for stale/deactivated/revoked sessions without minting browser sessions.
5. For the global directory, prepare APP-created and BMS-created accounts, customers of two different SEQ partners, an inactive account and an APP_USER without email. All must appear by default; memorial/pet profiles must not. Filter active/inactive, search a partner's legal/trade name and paginate/reload with the filters retained. Check the company, date and status against the stored rows. Partner/inactive/email-less accounts must not offer independent gift/resend actions. This scenario was documented but not executed in the 2026-10-09 source-only task.

### QA evidence

The [2026-10-07 consumer audit](../../../docs/audits/CONSUMER-ACCESS-2026-10-07.md) records 969 passing deterministic tests, nine real PostgreSQL cases, browser screenshots and independent persistence checks. Real inbox placement/Google are n/a; final compile, cleanup and production results are kept separately in that audit.

## Runbooks

Open **Clientes → Clientes finais**, or use **Clientes finais** on the existing Clients page, to consult all registered APP customers. Use **Ativos e inativos**, **Conta ativa** or **Conta inativa** and search by name, email or partner company. A company's link opens its existing BMS record.

1. Open **Clientes → Clientes finais → Cadastrar cliente** for a new independent account. Enter name, surname and the final customer's email; optionally record an internal reason. The form grants 12 months of Premium immediately.
2. For an existing independent account, use **Liberar Premium** in the directory or enter the same email. A currently valid gift keeps its expiry. Existing paid Premium days are preserved for a first gift.
3. If mail is pending, use **Reenviar e-mail** after checking the shared mail provider. Do not create another registration. The APP's normal **Esqueci minha senha** remains available.
4. For a partner-owned account or live recurring subscription, resolve the existing customer/billing relationship through its owning workflow. This action neither detaches a funeral home nor cancels billing.
5. Production delivery uses the existing Azure workflow: migrate once, deploy the immutable SHA images, then verify all app readiness endpoints. Do not issue live gifts or mail to real customers solely for deployment verification.

## Gaps and fixes

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

## Verification log

| Date | Revision | Scope | Evidence / limits |
| --- | --- | --- | --- |
| 2026-10-07 | `b8afb94` + this change | Source and initial tests | Entry/DAL/schema/service/DB/mail/APP entitlement traced; initial 49 focused cases and nine disposable PostgreSQL cases passed. Final checks and UI evidence are recorded in the audit. |
| 2026-10-07 | Same change | Final local acceptance | 969 deterministic tests and nine enabled PostgreSQL cases passed; typecheck, lint, all three local builds and contract checks passed. Normal BMS/APP UI verified new/existing access, duplicate prevention, email failure/retry and permission boundaries; final directory screenshot and build-cache incident/cleanup are retained in the audit. |
| 2026-10-07 | `8422e6c` | Production release | CI and Deploy Azure completed successfully; migration execution succeeded; all three immutable images reached ready revision `0000011` with 100% traffic and six canonical HTTPS health checks passed. Anonymous `/consumers` rendered sign-in; protected gifts and inbox delivery were not exercised with real production customers. |
| 2026-10-09 | `4eb3d5c` + global-directory change | Source | Traced APP/SEQ/BMS registration, APP_USER/Tenant relations, live administrator guard, global query, status/search/pagination and independent-gift boundaries. Reviewed the directory, Clients shortcut and all three locale changes; `git diff --check` passed (formatting only). |
| 2026-10-09 | Same change | Automated checks | Query regression definitions updated but not executed. No automated tests, typecheck, lint, build or docs validator run in this task; automated tests were waived by the user. |
| 2026-10-09 | Same change | Runtime / UI / persistence | n/a: omitted at the user's request. No app started, browser used, database/provider writes made or owned processes left running. |

## Related

[PARTNERS](PARTNERS.md) · [DISCOUNT-COUPONS](DISCOUNT-COUPONS.md) · [ACCOUNTS-STAFF](ACCOUNTS-STAFF.md) · [APP billing](../../app/docs/BILLING-QUOTAS.md) · [EMAIL-DELIVERY](../../../docs/EMAIL-DELIVERY.md) · [DATABASE](../../../docs/DATABASE.md) · [TESTING](../../../docs/TESTING.md) · [Audit](../../../docs/audits/CONSUMER-ACCESS-2026-10-07.md)
