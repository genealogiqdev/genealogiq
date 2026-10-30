# SEQ automatic QR stock accounting — 2026-10-29

## Request and source

The initial report showed 400 available GenCodes despite registered customers. The user clarified that deduction must happen automatically when the QR is created. Work starts at `f61444c` on `main`; unrelated concurrent APP/BMS/SEQ changes are preserved.

The old customer QR action returned an authorized profile URL without inventory writes. The new transaction locks the accepted memorial, reads live tenant/customer/guardian/plan scope, reuses an existing linked plaque or selects the customer's unactivated purchase before AVAILABLE tenant stock, consumes the shared ledger and persists activation/QR together. Customer registration and Premium management remain separate. Existing QR destinations, print status, sale metadata and profile tenancy are preserved. No migration or bulk production data correction is involved.

## Verification

- Source: customer dialog → server action → tenant session → scoped transactional query → GenCode/credit/QR writer traced. The installed Next.js revalidatePath guide confirms invalidation on subsequent inventory/customer navigation.
- Tests: initial 39 focused action/writer/query/DOM tests passed. Real PostgreSQL, final static checks and local runtime results are recorded below after execution.
- Production inspection: Vercel confirmed the canonical SEQ deployment READY at source `56f72f4602f1d396aa6200955500852a7d7ed3d1`, which already includes the October 14 optional registration sale. A read-only production data inspection could not obtain a usable connection; no customer-specific production row claim is made.
- UI on October 29: Chrome integration timed out twice on Page.navigate and left a blank tab. That attempt did not establish visual acceptance; the successful October 30 continuation is recorded below. No built-in browser was used.

## Expected local scenarios

First generation: 400/0/0 → 399/1/1 with one CONSUME and one profile/QR binding. Concurrent/repeated generation remains 399/1/1. A previously sold customer unit transitions 399/1/0 → 399/1/1. Another tenant or pending guardian must be denied; FREE/over-limit and missing stock/credit must not issue a QR. Failure persisting the QR must roll back the stock, binding and credit. Existing printed destinations must remain byte-for-byte unchanged.

## Cleanup and limits

External providers are disabled for local runtime. Browser interaction and production row acceptance remain separate from unit/HTTP/SQL results. Only this task's local server, disposable integration database and generated tsconfig includes are eligible for cleanup; other tasks' servers and changes are preserved. No deployment or production write is authorized by this audit.

## October 30 completion evidence

### Source and regression checks

The resumed Chrome flow exposed an additional React identity issue: refreshing the customer table after a successful issuance recreated the inline QR cell and closed its dialog. The QR cell is now a stable module-level component. A DOM regression failed before that fix (dialog disappeared) and passed afterward; it verifies that the same dialog remains open with all six presets and downloadable SVG following a table refresh.

- Full deterministic suite on October 29: 159 files / 1,496 tests passed, nine opt-in files / 59 tests skipped. This run precedes the additional table-refresh regression; its final focused run covers the subsequent source change.
- Final focused action, writer, customer/inventory query and real-portal DOM suite: 40 tests in five files passed. No expected stock value is computed using the implementation under test.
- Real PostgreSQL: nine enabled tests passed against disposable `genealogiq_coupon_qa_seq_qr_20261029`. They cover literal 400/0/0 → 399/1/1, three concurrent opens, two profiles competing for one unit, committed sale reservation reuse, other-buyer isolation, cross-tenant accepted-guardian plaque reuse, legacy printed URL preservation, unauthorized/FREE/unfunded rejection and rollback after QR persistence failure.
- Prisma generation, SEQ typecheck, changed-file ESLint, locale parity/key checks and documentation checks passed. The provider-disabled isolated SEQ production build passed; the final build after the stable-cell fix is recorded with cleanup below.

Local evidence is retained under `.local-qa/seq-qr-stock-20261029/`; the full deterministic log is `.local-qa/seq-qr-stock-tests-20261029.log`. These ignored artifacts are local evidence, not checked-in fixtures or production records.

### Runtime and UI

The owned SEQ process ran at `http://127.0.0.1:6002` using the documented local launcher, loopback PostgreSQL and disabled external providers. Ordinary Credentials login was used with synthetic tenant/operator/customer data.

- HTTP/session/action/persistence: anonymous access redirects without customer data; authenticated first generation changes 1/0/0 to 0/1/1; repeat returns the same QR; empty stock and a foreign profile reject without extra writes. Reloaded inventory includes the buyer and memorial. `runtime.json` records those checks separately from UI evidence.
- Chrome recovered on October 30. On the final source, generating the second fixture memorial kept the QR dialog open with six presets, updated the customer's sold count, and produced a real downloaded SVG. Closing/reopening and downloading the same SVG again succeeded with zero remaining stock. Both downloaded files were present in the normal Downloads folder at 2,884 bytes.
- A third memorial showed the translated no-stock error and no QR presets. Navigation through **Meus GenCodes** displayed 0 available / 2 sold / 2 activated, with the two matching buyer/memorial rows. The first fixture unit had already been consumed during the earlier browser check; one disposable TOPUP supplied the second unit for the final dialog regression.
- Independent PostgreSQL verification after both downloads confirmed exactly two CONSUME entries, two activated codes, one QR for the second profile and no QR for the rejected third profile. Evidence: `browser-persistence.json`, `browser-qr.png`, `browser-no-stock.png`, `browser-inventory.png`.
- The browser download-event wait timed out, but the actual SVG was saved and a subsequent repeat showed **SVG baixado.** and created the second file. That tooling timeout is not counted as a failed product download.

Production acceptance remains n/a: this change has not been deployed, no customer-specific production data was corrected, and no historical bulk reconciliation was run. Local SVG output/persistence is verified; physical printing/scanning and all preset/device combinations were not repeated in this focused check.

### Final build and owned-process cleanup

The final isolated SEQ build, including the stable QR table cell, exited successfully in 100 seconds with TypeScript and route generation complete. Output used `.next-qa-seq-qr-20261030`; local QA intentionally omits standalone copying. No additional Prisma generation was needed. The final typecheck and changed-file ESLint also exited zero, and docs/i18n checks reported no errors.

The owned development server (Next CLI PID 46364 and child PID 42648 on port 6002) was stopped before this build; port 6002 no longer listened. The test Chrome tab was closed, the disposable integration database and its temporary dump had been removed, and only the four generated SEQ tsconfig include entries were removed. A semantic comparison verified that the restored tsconfig matches HEAD; other APP/BMS configurations, PostgreSQL/Azurite services and synthetic local ledger history were preserved. Ignored logs, screenshots and the downloaded SVG copy remain for inspection.

Concurrent commit `e97720e` changed only APP feature paths; the source recheck from `011968c` through that commit found no changes to SEQ or its shared auth/core/services/database dependencies.
