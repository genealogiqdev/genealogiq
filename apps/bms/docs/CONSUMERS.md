# Direct consumer registration and Premium gifts

> **Code:** [consumer actions](../src/actions/consumer.actions.ts) · [schema](../src/schemas/consumer.schema.ts) · [directory queries](../src/queries/consumers.ts) · [form](../src/components/consumers/consumer-form.tsx) · [platform guard](../src/lib/consumer-access.ts) · [atomic grant](../../../packages/services/src/consumer-access.ts)
> **Entry points:** BMS **Clientes → Clientes finais** (`/consumers`) and `/consumers/new`; existing customers can be selected from the directory.
> **Depends on:** [AUTHENTICATION](../../../docs/AUTHENTICATION.md) · [EMAIL-DELIVERY](../../../docs/EMAIL-DELIVERY.md) · [APP ACCOUNTS](../../app/docs/ACCOUNTS.md) · [BILLING-QUOTAS](../../app/docs/BILLING-QUOTAS.md)
> **Last verified against code:** 2026-10-07 at `b8afb94` plus this change. See the [consumer access audit](../../../docs/audits/CONSUMER-ACCESS-2026-10-07.md) for source, tests, runtime/UI and production evidence separately.

## How it works

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

- These consumers are **AppUser**, role `APP_USER`, with `tenantId=null`. No Tenant, staff User, GenCode, credit, order or coupon is created. The AppSale also has `tenantId=null`.
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

The directory searches first name, last name or email and paginates 25 rows. It lists independent APP users only, shows the current plan/expiry and latest gift email state, and selects no password or Google identifier. Long names, emails and plan labels wrap so the action buttons remain visible at normal desktop widths. An existing customer's registration prefill is also scoped and privileged.

| Model/table | Purpose |
| --- | --- |
| AppUser / `app_users` | Independent APP identity; `createdById` identifies the registering staff member |
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

### QA evidence

The [2026-10-07 consumer audit](../../../docs/audits/CONSUMER-ACCESS-2026-10-07.md) records 969 passing deterministic tests, nine real PostgreSQL cases, browser screenshots and independent persistence checks. Real inbox placement/Google are n/a; final compile, cleanup and production results are kept separately in that audit.

## Runbooks

1. Open **Clientes → Clientes finais → Cadastrar cliente**. Enter name, surname and the final customer's email; optionally record an internal reason. The form grants 12 months of Premium immediately.
2. For an existing independent account, use **Liberar Premium** in the directory or enter the same email. A currently valid gift keeps its expiry. Existing paid Premium days are preserved for a first gift.
3. If mail is pending, use **Reenviar e-mail** after checking the shared mail provider. Do not create another registration. The APP's normal **Esqueci minha senha** remains available.
4. For a partner-owned account or live recurring subscription, resolve the existing customer/billing relationship through its owning workflow. This action neither detaches a funeral home nor cancels billing.
5. Production delivery uses the existing Azure workflow: migrate once, deploy the immutable SHA images, then verify all app readiness endpoints. Do not issue live gifts or mail to real customers solely for deployment verification.

## Gaps and fixes

### CONSUMERS-G1: No direct independent customer gift flow

- **Status:** fixed
- **Found:** 2026-10-07, requested onboarding simplification for legacy families.
- **Evidence:** BMS exposed partner registration and coupon settlement for an existing APP user; neither created an independent consumer with a Premium gift.
- **Impact:** The team could not finish the family's account and complimentary year in one BMS operation.
- **Root cause:** Registration belonged to APP/SEQ, while BMS's consumer settlement required an existing identity and coupon.
- **Resolution:** This change adds the platform-only directory/form, atomic account/gift/audit writer, direct credential email with recovery, and APP gift presentation. Source/tests/UI evidence and final revision are retained in the linked audit.

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

## Related

[PARTNERS](PARTNERS.md) · [DISCOUNT-COUPONS](DISCOUNT-COUPONS.md) · [ACCOUNTS-STAFF](ACCOUNTS-STAFF.md) · [APP billing](../../app/docs/BILLING-QUOTAS.md) · [EMAIL-DELIVERY](../../../docs/EMAIL-DELIVERY.md) · [DATABASE](../../../docs/DATABASE.md) · [TESTING](../../../docs/TESTING.md) · [Audit](../../../docs/audits/CONSUMER-ACCESS-2026-10-07.md)
