# BMS partner access email resend — 2026-10-15

## Request and source

The user confirmed that the email destination defect was already fixed and requested a BMS option to resend access to existing business partners, plus production deployment. Browser automated tests were explicitly waived. No real client email was requested as part of verification.

Started on `main` at `3e4573a` with a clean working tree. Rechecked the partner source since the feature's previous `1535974` verification: `bb60aa7` introduced destination validation and no later commit changed the partner action, query or UI before this work.

The existing action already accepted active OWNER accounts with a password and generated a 72-hour setup link using validated `SEQUOIA_URL`. Its generic list-menu entry was the only resend entry point. This change adds the **Acesso ao SEQUOIA** card above the partner edit form, links partner names to that form, and names the existing menu option **Reenviar acesso ao SEQUOIA**.

The card shows the saved OWNER email, disables duplicate clicks while sending, and reports success or a retryable failure. Missing/inactive administrators receive an explanation and a disabled button. A guarded query exposes only email/active status to the same privileged BMS roles as the existing action; nonprivileged viewers do not receive the access card or resend menu entry. No schema, domain value, credential, email transport or registration/credit behavior changed.

## Automated checks

- Focused BMS card, action, recipient and email adapter suites: **63 passed**.
- Full suite with local Azurite enabled: **148 files / 1,373 tests passed**, seven opt-in PostgreSQL integration files / 50 tests skipped. Skips are not passes.
- Sequential Prisma generation and workspace typecheck: **11 tasks passed**. Standard Turbo commands can invoke their generation prerequisite; no concurrent generation was launched.
- Workspace lint: **0 errors, 49 existing warnings** (APP 8, BMS 21, SEQ 20).
- Schema parity, all 78 migration shapes, nine locale files, locale key references, documentation and whitespace checks passed. Locale analysis retains 95 dynamic calls and one unmapped columns file; these are not exhaustively checked.
- `infra/main.bicep` compiled successfully. No infrastructure definition changed.
- BMS production build passed, including TypeScript and all 35 generated pages, with isolated `.next-qa-partner-resend-build` output. As documented for local QA, standalone copying is omitted; this is not a Linux container/runtime verification.

Literal expectations cover the recipient and product wording, no send on load, the selected partner ID, pending-click suppression, provider/connection failure and retry, inactive/missing-owner controls, restricted recipient reads, administrator authorization, hashed 72-hour staff tokens and preserved registration/credit behavior.

## Local runtime and UI

Local verification uses the guarded launcher, normal Credentials authentication, the existing synthetic partner from this chat's October 14 audit, PostgreSQL on loopback, and a loopback-only mail provider that accepts only the synthetic `genealogiq.test` fixture. Captured setup tokens remain in ignored local evidence. Browser automation is waived; component DOM and rendered HTTP evidence are not described as browser verification.

The BMS ran on localhost:6001 with its mail fixture on 127.0.0.1:5105. Six scenario groups passed:

| Scenario | Independent expected / observed result |
| --- | --- |
| Existing partner | Normal BMS Credentials sign-in; partner name links to its edit page; rendered page contains the access card, button and OWNER email; loading does not create tokens |
| Detail resend | The selected existing OWNER receives one captured Sequoia `/reset-password` link; database stores its SHA-256 hash, User association and 72-hour expiry; no AppUser token |
| Repeat and reload | Button remains present after reload; another send replaces the prior token with one new token |
| Provider failure and retry | Loopback provider returns 422; action reports failure, then succeeds when the fixture recovers; no repeated registration or credit grant |
| Inactive owner | Page explains inactive access; server rejects resend without replacing the token; original active state restored afterward |
| Anonymous access | Protected detail and forged resend redirect to sign-in; no token rotation or account/credit changes |

Across the scenarios, independent PostgreSQL snapshots confirmed unchanged tenant/staff/consumer/credit-grant counts and the exact current password hash. The original fixture's active status was restored; the latest expiring test setup token is retained in the local database. Captured mail and the sanitized scenario ledger remain under ignored `.local-qa/partner-resend-2026-10-15/`.

The first runtime attempt stopped at an expiry assertion because node-postgres interpreted a UTC `timestamp without time zone` as workstation local time. Direct PostgreSQL comparison independently showed approximately 72 hours. The harness was corrected to read `expires_at AT TIME ZONE 'UTC'`, and all six scenarios then passed without changing product code or relaxing the expected expiry.

The owned BMS/mail processes were stopped and ports 6001/5105 released before the build. After the build, only this session's `.next-qa-6001` and `.next-qa-partner-resend-build` TypeScript includes were removed. The preflight found the project's compose services stopped; this session started and then stopped only PostgreSQL/Azurite, preserving their volumes. Final checks confirmed no listeners on 6001, 5105, 5432 or 10000. The pre-existing unrelated listener on port 3000 was left running. Real Resend/inbox acceptance is not part of this local fixture.

## Production prerequisite discovered before deployment

The existing October 14 release was successful; [that audit](PRODUCTION-RELEASE-2026-10-14.md) remains historical evidence. During this request's preflight, live ARM reported subscription `c710b26f-e3c7-4a45-9477-eaaf3bdcc329` as **Warned**, despite cached `az account show` saying Enabled. The live policy was **PayAsYouGo_2014-09-01**, spending limit **Off**. A later pre-build live query still reported Warned.

All three Container App resource summaries reported failed provisioning. The BMS revision API explicitly returned **ManagedClusterSuspended**, stating that compute for `cae-genealogiq-prod` was suspended because the subscription was disabled. All three custom-domain readiness requests timed out at 20 seconds each. These observations establish a provider-side production prerequisite, not the exact billing reason. The user was asked to check billing/reactivation while implementation and local verification continued.

The final check at **2026-10-15 18:35:53 UTC** still returned **Warned / PayAsYouGo / spending limit Off**, and BMS revision listing still failed with **ManagedClusterSuspended**. Deployment remains blocked at preflight; no new release workflow, image update, migration or production email was executed. The source change is retained on the starting `main` branch; pushing `main` normally triggers deployment, so it was not pushed into the already suspended environment.

Recheck live subscription state, compute/revisions and image-change what-if after the subscription is restored, then push the reviewed `main` change through the existing immutable-SHA deployment workflow and verify the new image, traffic and live/ready endpoints. Source tests and the previous release do not confirm production deployment. Do not recreate infrastructure or retry migrations to diagnose a suspended subscription.

## Related

[PARTNERS](../../apps/bms/docs/PARTNERS.md) · [Email destination audit](BMS-PARTNER-EMAIL-2026-10-14.md) · [Azure runbook](../AZURE-AGENT-RUNBOOK.md) · [Previous suspension](PRODUCTION-OUTAGE-2026-10-13.md)
