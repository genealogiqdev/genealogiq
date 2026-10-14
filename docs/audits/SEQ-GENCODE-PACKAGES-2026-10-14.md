# Sequoia GenCode package purchase — 2026-10-14

## Request and source

Add **Pacotes de GenCodes** beside **Assinar um plano**, permit quantity selection and charge R$150 per unit, with an automatic 10% coupon from 50 units. The user's R$6,750 example makes the 50-unit threshold inclusive. Minimum 20 follows the requested example and existing canonical catalog contract.

Work started on `main` at `58d4145` with a clean tree. The feature's prior verification was `3826319`; the intervening `462f8a9` shared checkout/webhook changes were re-read. Other agents subsequently edited and committed unrelated APP/BMS/customer work in the same checkout. This task keeps its original branch and preserves those edits.

Source trace: sidebar → `/purchasing/packages` → tenant guard → translated Zod quantity contract → server-selected canonical BRL package → shared order/Stripe checkout → signed, origin-scoped SEQ webhook → atomic order/TOPUP/code/outbox fulfillment. No schema or migration was added. The existing catalog price remains authoritative, and BMS manual/selected coupons keep their existing behavior.

## Deterministic tests

- Focused run: **6 files / 72 tests passed**. Coverage includes literal totals at 20/49/50/51/100, integer-cent rounding, custom input and preset interaction in the DOM, invalid inputs, fixed tenant/operator/product authority, provider failures, self-service coupon non-stacking, scoped history, origin filtering and real signature verification of locally generated webhook payloads.
- Full suite at 09:20 local: **138 files / 1,317 tests passed; one file/test failed; seven files / 44 tests skipped**. The failure was `apps/bms/src/queries/consumers.test.ts`, whose expected selection did not yet include `appSale.tenantId` added by concurrent consumer work. No package test failed. This is not a full-suite pass.
- Final full suite at 09:47 local, after the concurrent consumer expectation was updated: `pnpm run test --reporter=dot --maxWorkers=2` passed **146 files / 1,359 tests**, with **eight files / 51 tests skipped**. The skipped integration cases are not counted as passes; the package PostgreSQL suite was enabled separately below.
- Prisma was generated once. SEQ, services and core TypeScript checks passed after fixing two test-only type annotations. SEQ lint passed with 20 warnings outside the new package files.
- Focused lint on the changed package source passed without warnings. Locale parity, static translation references, schema parity and documentation validation passed. Translation-reference validation retained the existing dynamic/unmapped-call limitations.
- The initial Turbopack build failed with Windows OS error 1450 (insufficient system resources while reading dependencies). A sequential production build using the installed Next.js documented `--webpack` option passed: compilation, TypeScript and 27 static-page generation steps completed, and the route manifest includes both `/purchasing/packages` and `/purchasing/plans`. External providers were disabled and the output used the isolated `.next-qa-gencode-packages` directory.

## PostgreSQL evidence

Created the isolated `genealogiq_coupon_qa_seq_packages_20261014_1220` database from the local schema. The first run found the copied schema lacked `email_outbox`; its paid transaction rolled back. Applied the already-existing `20261009020000_email_outbox` SQL only to this disposable database and reran: **four integration tests passed**.

Observed independent expectations:

1. A 20-unit request persists PENDING, gross unit price 150, discount 0, total 3,000 and zero minted units; an unpaid callback grants nothing.
2. A 50-unit request persists discount 750, total 6,750 and `GENCODES10`. Two simultaneous confirmations produce one fulfilled/one already-fulfilled result, one TOPUP grant for 50, one GRANT ledger row, 50 codes and one outbox receipt. Credits expire in twelve months. Temporarily changing the disposable catalog to 160 leaves the paid total at 6,750 and the code count at 50; the catalog is restored afterward.
3. Quantity 19 and a synthetic provider rejection leave order and grant counts unchanged.
4. Expiring an unpaid session persists EXPIRED and a later fulfillment attempt mints nothing.

Stripe customer, coupon and checkout transport in this suite are synthetic. No real payment or email delivery occurred.

## Local runtime

Started SEQ with `node scripts/local-qa.mjs --app=seq` at `http://localhost:3002`; the launcher explicitly disables external payment/mail providers. Existing PostgreSQL and another app's processes belonged to concurrent work and were reused only as the documented local database dependency.

Normal Credentials HTTP authentication succeeded with the public local fixture. The protected route rendered the actual sidebar links, 20/50 price options and package history, and the same content survived a second request. Anonymous navigation returned the normal streamed Next redirect to sign-in without rendering the quantity control. Real server-action HTTP requests rejected 19 with the translated minimum and returned controlled provider-disabled feedback at 20/50; independent tenant order, grant and code counts stayed unchanged. The page remained available on reload after these attempts. These are HTTP/runtime checks, not browser UI acceptance.

## UI and provider prerequisites

Chrome integration was explicitly selected and failed with **`Codex auth token is unavailable`**. The connection issue was reported to the user with a request to reconnect Chrome. No built-in browser or alternative browser-control mechanism was used. Manual visual/mobile/navigation acceptance remains **n/a**; DOM component tests do not substitute for that product step.

A later inventory listed the Chrome extension and allowed selecting it, but tab/session operations still failed with the same authentication error. No successful tab creation or visual inspection is claimed.

Real Stripe Checkout, deployed endpoint event selection, provider acceptance of the per-order coupon and inbox delivery remain **n/a**. Before release, follow the feature runbook to include the four checkout-session events at the SEQ endpoint and run an authorized test checkout. No production configuration, push or deployment was performed by this task.

## Cleanup and final checks

Both owned SEQ launcher runs and the production build process have ended; a final port check found zero listeners on 3002. Existing Docker services and other agents' app processes were not stopped. Removed only this task's generated-type includes for `.next-qa-3002` and `.next-qa-gencode-packages` from the SEQ TypeScript configuration, preserving concurrent agents' entries.

Automatic execution review rejected the command to remove the owned `.next-qa-gencode-packages` output and drop `genealogiq_coupon_qa_seq_packages_20261014_1220`, reporting only `blocked by policy`. No deletion ran. A subsequent read confirmed both resources remain; cleanup is pending. Existing development caches and the ordinary local database were preserved. Ignored HTTP, integration, build and full-suite logs remain under `.local-qa/2026-10-14/`.
