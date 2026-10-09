# Tree profiles in memorials and profiles under care — 2026-10-09

## Scope and source

Started on `main` at `08b2b1c` with unrelated uncommitted BMS/SEQ, email, billing and schema changes already present. The branch is unchanged. Reviewed the root/APP guides, memorial/tree/pet/billing contracts and open gaps. The core memorial/tree/pet actions and queries had no commits since the older `6e06634` verification; `12bbeb6` updated the profile's pet GenCode display. Relevant concurrent changes are kept separate from this feature's evidence.

The **Novo → Selecionar da árvore** route lists only accepted, manageable members of the signed-in account's tree. Human `APP_GHOST` nodes can become `APP_MEMO` after a public-memorial confirmation. Only the existing row's role changes; no new identity, guardian, relation, content or pet ownership is created. Unknown dates remain unknown. `APP_USER` accounts cannot be converted. Existing managed pets/memorials link to the original profile and consume no additional slot. Home, profile preview and the guarded-profile list include pets with the proper badge and safe initials.

The server rechecks accepted tree membership and guardianship and counts memorials inside a serializable transaction. It resolves each affected guardian's plan/extras through transaction-aware versions of the existing readers, rejects a full allowance, and retries `P2034` at most three times. The acting guardian receives the current limit and tier for the upgrade dialog. Other-guardian capacity failure is generic. Idempotent existing-profile results do not write or demand another slot. This is not a retrofit of the older direct-create/guardian-approval concurrency behavior.

The installed Next.js `revalidatePath` reference was reviewed for page patterns and the converted profile's content invalidation. No new schema, migration, authentication method or external provider call was added.

## Tests and static checks

- Six new focused spec files: **38 passed**. They cover action scope/input/role checks, the same profile ID and a role-only update, separate human/pet queries, current quota metadata, co-guardian caps, simulated transaction conflicts and repeat submissions, accent-insensitive search, real confirmation/limit dialogs, cancellation, transport retry, existing pet navigation, empty state and refreshed home cards. Mocked database tests do not establish PostgreSQL locking/persistence.
- Root `pnpm test`: **1104 passed, 30 failed, 34 opt-in skipped** across 131 files. All new tests present in that run passed. The 30 failures were in already-modified email/outbox paths: `manual-coupon.test.ts` (9), `partner-billing.test.ts` (11), BMS manual-coupon action (2), SEQ customer action (3), SEQ GenCode action (1), APP extra-unit purchase (3) and APP Stripe webhook (1). Representative errors were missing outbox recipients, older mocks without `$transaction`, and changed email-pending/ignored response expectations. The failing purchase/webhook/notification behavior came from those concurrent edits. This feature only adds a transaction argument to the extra-unit read helper; it does not change that purchase writer.
- Prisma generation succeeded once. APP TypeScript passed. APP ESLint passed with **0 errors / 8 existing warnings**.
- Locale parity passed across all nine message files. The first key-reference pass identified the picker's nested namespace, which was corrected to the existing top-level namespace convention. Remaining concurrent SEQ email keys are tracked separately at final verification.
- The APP production build passed (33 static pages plus dynamic routes, including the selector), using the provider-disabled loopback environment and isolated output. Final source checks are recorded below.

The full-suite run preceded the additional home/preview and transaction-reader assertions; the full-suite total is retained as observed rather than updated by arithmetic.

## Runtime

Local startup with `node scripts/local-qa.mjs --app=app --host=127.0.0.1 --port-offset=3300` failed its PostgreSQL prerequisite. `pnpm db:up` and `docker compose ps` returned Windows **Access is denied** on Docker Desktop's Linux engine pipe. `docker desktop status` could not reach Desktop; a normal start was attempted and the user was asked to open Desktop while independent checks continued.

## UI

**Product happy path, capped-plan rejection in Chrome, reload/database persistence and real concurrent conversions: n/a, not passed.** No product listener, signed-in screen, DOM test or build is counted as that evidence. Use the normal fixture Credentials sign-in and Chrome integration once PostgreSQL is available. Remaining acceptance:

1. Record a disposable managed ghost's ID, data/content/relationship/guardian rows and a managed pet's current ID/counts.
2. Open **Perfis sob minha guarda → Gerenciar perfis → Novo → Selecionar da árvore**, filter/search a pet and open its original profile. Confirm it also appears on home and the guarded list without another slot.
3. Promote the disposable human, reload the list and tree, and independently verify only role/normal update time changed on the same AppUser, with all content/relationships retained.
4. Fill the disposable guardian's memorial allowance and attempt another promotion. Expect upgrade options, no new AppUser and the untouched ghost. Repeat a successful request and try a pending guardian/detached member: no duplicate or unauthorized write.
5. Restore the disposable fixture role and verify the original rows; stop only owned runtime processes.

## Cleanup and delivery

No database rows or provider resources were modified. The attempted local launcher exited before spawning a product app. Build output/logs use ignored `.local-qa/2026-10-09/tree-memorial/` and `.next-qa-tree-memorial-build`. Final build/owned-process cleanup and the feature commit are recorded in this change's verification entries.

## Final verification

The normal Docker start command remained unresponsive and its owned CLI process was canceled. A subsequent engine read still returned Access is denied. No product server or database fixture was started, and no Docker service or volume was stopped. The commit contains the tree-reuse implementation and its documentation/tests; concurrent email, SEQ QR and consumer-access edits are kept out of its staged changes.

- Final focused run: **62 passed** in nine files, including **38 new tests** and the existing subscription/memorial/pet quota regressions. All plan, FREE fallback, inherited-plan ranking and extra-unit reads use the supplied transaction; no global database reader is called from those transaction tests.
- Final root suite: **1127 passed, 30 failed, 34 skipped** (121 passed files, seven failed, five skipped). The same seven concurrent email/outbox suites failed; no new feature test failed. Ignored log: `.local-qa/2026-10-09/tree-memorial/full-suite.log`.
- Final APP TypeScript and focused ESLint passed. Earlier whole-APP lint had eight existing warnings and no errors.
- Locale parity passed across nine files. The repository-wide key check still reports five missing references in concurrent SEQ email actions (four distinct keys); it reports no missing APP/tree-selector keys.
- Documentation contracts passed for four guides and 40 indexed features.
- Final APP build passed after the transaction-reader changes, including the new dynamic selector route and 33 static pages. Only this build's two generated TypeScript include paths were removed afterward; other local sessions' entries remain. All owned build processes exited and the Docker-start CLI was canceled. No product process or fixture needed cleanup.
