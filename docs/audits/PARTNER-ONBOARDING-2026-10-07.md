# Immediate partner onboarding — 2026-10-07

## Scope and source

The user requested immediate emailed login credentials when registering a funeral home, an initial GenCode quantity including zero, and a commit and production deployment. Work stays on the existing `main` branch. Existing tsconfig/local assets and the other production-release audit belong to other work and are excluded from this change.

The new BMS OWNER is active with a generated password stored only as bcrypt. Its email defaults to the company's contact email but remains editable. The administrator selects 0–10,000 initial GenCodes. A single database transaction creates tenant, owner, standalone 12-month TOPUP grant, audited GRANT receipt and exactly the entered number of AVAILABLE codes. Zero has no grant or code. No checkout, order, coupon, subscription or premium consumer trial is created. Existing inactive owners retain the settlement compatibility path.

The credential email is sent after commit. Resolved Resend rejection now fails the transport instead of falsely confirming success. Registration reports email pending without discarding the account/allowance; the BMS resend action can send a setup link without replacing the existing password or creating more credits. Credit history prevents deletion of the tenant.

## Automated evidence

- Prisma generation passed; TypeScript passed all 11 tasks.
- Full deterministic suite: 107 files / 927 tests passed; three opt-in files / 13 tests skipped.
- Independently enabled PostgreSQL onboarding suite: four passed against disposable loopback `genealogiq_coupon_qa_onboarding_20261007`. Literal expectations: three activations without a purchase, fourth rejected, zero creates no credits, full transaction rollback, duplicate grant leaves one allowance.
- Lint passed with zero errors and 51 existing warnings. Single-schema, 75-migration structure, nine-locale parity and locale-reference checks passed (zero errors, 83 dynamic calls skipped). Documentation validation passed with four guides and 39 indexed features; whitespace checks passed.
- Sequential APP/BMS/SEQ production builds all passed: compile, TypeScript and static-page generation. The Bicep production template compiled successfully. Only this session's generated tsconfig include paths were removed afterward, preserving existing formatting changes.
- The disposable PostgreSQL database was dropped after its tests and independently confirmed absent; its temporary dump was removed.

## Local runtime and UI

Started the checked-in isolation launcher with offset 2000 and canonical 127.0.0.1, through a private fixture wrapper. BMS/SEQ/APP run on 5001/5002/5000. The only mail override is a loopback Resend-compatible capture service on 5105 accepting synthetic `@genealogiq.test` recipients; a dedicated address returns HTTP 422. No real email, payment or cloud data is used by this QA.

Normal BMS Credentials sign-in used the documented local fixture. Browser registration of `Funerária QA Acesso Imediato` selected three GenCodes; a negative value was rejected before advancing. The captured generated password signed in normally to SEQ, where dashboard showed three available credits, expiry October 7, 2027 and no contract. Inventory showed exactly three AVAILABLE codes after reload. Registration of `Funerária QA Zero` sent usable credentials and signed in with zero balance and empty inventory after reload.

The rejection recipient produced the explicit warning that registration and credits succeeded but email failed. It still has one active OWNER, two codes and two credits. Reenviar e-mail on the active zero-credit OWNER sent an expiring setup link successfully, without altering inventory. The original generated password was never shown in a tool output or screenshot.

Independent SQL observed these exact tuples `(active owners, codes, remaining credits, grants, orders, contracts)`: three-code partner `(1,3,3,1,0,0)`; zero partner `(1,0,0,0,0,0)`; rejected-mail partner `(1,2,2,1,0,0)`. These three fixtures and their ledger history remain in the normal local database for review. Screenshots `initial-codes.png`, `negative-quantity.png`, `three-codes-reload.png`, `zero-codes-reload.png`, `email-rejected.png` and captured credentials remain in ignored `.local-qa/onboarding`; no passwords or mail payloads are tracked.

The owned launcher/mail service stopped after UI verification. Ports 5000/5001/5002/5105 were released; the pre-existing app on port 3000 and shared compose services were left running. Local production builds use separate `.next-qa-onboarding-build` directories, sequentially, without competing for another process's `.next`.

## Production and limits

Deployment is explicitly authorized. The existing GitHub main workflow builds immutable images, runs the migration job once and updates the three Azure apps. This change needs no database migration. Confirmed Azure subscription `c710b26f-e3c7-4a45-9477-eaaf3bdcc329`. Deployment, readiness and owned-process cleanup evidence are appended when complete. Real recipient inbox delivery remains a provider scenario; local capture alone is not a production delivery pass.

Before deployment, BMS served revision `0000009` with image `ddc79a255e2028772186be7aa54269045be2fd69`. Its Sequoia origin was `https://sequoia.genealogiq.com.br`, and the Resend setting referenced the existing `resend-api-key` secret. No secret value was changed. No production account or test sale is created for verification.

## Completed release

Code commit `2632307bc4b643bd07f06d318339a44c0a227d43` was pushed to the existing `main` branch. [CI](https://github.com/genealogiqdev/genealogiq/actions/runs/37662733049) passed its verification job and all three Linux container startup jobs. [Deploy Azure](https://github.com/genealogiqdev/genealogiq/actions/runs/37662733205) succeeded: all five images built, the migration step completed before rollout, and generated-host live/readiness checks passed.

Independent Azure inspection confirmed APP, BMS and SEQ all use that exact image SHA. Each latest revision and latest ready revision is `0000010`, with 100% of traffic assigned to it. On the three canonical HTTPS origins, `/api/health/live` returned 200/ok, `/api/health/ready` returned 200/ready and `/sign-in` returned 200.

Anonymous BMS `/customers/new` and SEQ `/inventory/activations` return Next.js streaming responses with the expected `NEXT_REDIRECT` digest and `/sign-in` refresh metadata; the initial HTTP-only check expected a 3xx status and was corrected after inspecting that response. Independent production browser navigation confirmed both routes end on their normal sign-in forms. No authenticated production feature or real recipient inbox delivery is claimed. All feature-specific account, quantity, delivery-failure and persistence acceptance remains the local evidence above.

This final evidence update is documentation only and is committed with `[skip ci]`; it does not change or replace the deployed code. The owned test servers/mail capture and build processes have finished, and the disposable integration database is gone. Existing shared services, other local changes and the retained local QA ledger fixtures are preserved.
