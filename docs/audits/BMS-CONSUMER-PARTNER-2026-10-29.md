# BMS consumer company linking — 2026-10-29

## Source

Started on `main` at `f61444c` with a clean working tree. Reviewed root/BMS/SEQ guides, consumer and memorial contracts, GAPS, TESTING and LOCAL-DEVELOPMENT. Rechecked relevant history since `58d4145`; `6fae091` introduced the current partner access flow. During this task, other chats edited APP and SEQ sources in the shared checkout; their implementation changes are not part of this company-link change.

The BMS directory now links an existing independent APP_USER to an active company with active staff. The live platform guard, bounded IDs, transaction row lock and conditional update reject unauthorized callers and transfers of already linked customers. A repeated request for the same company succeeds without rewriting the operator. Only customer affiliation and last editor/time change. Direct APP registrations need no re-registration. Original BMS gifts preserve their sale scope and remain manageable in BMS after linking.

No schema migration, production data write, email, checkout or deployment is part of this task.

## Automated checks

- Focused action, directory, dialog, resend and direct-gift revocation suite: 65 tests passed.
- Full working-tree suite: 155 files passed; 1,463 tests passed, 52 optional integration tests skipped. Includes contemporaneous unrelated changes and is not isolated evidence for those changes.
- Enabled direct-gift revocation integration suite on disposable local `genealogiq_coupon_qa_link_20261029`: 11 tests passed, including preserved affiliation after direct-gift revocation and rejection of a gift whose sale was transferred to a partner.
- BMS typecheck passed. BMS lint passed with 21 existing warnings and zero errors.
- Isolated BMS production build passed: compilation, TypeScript and all 35 prerender entries. Local output used `.next-qa-consumer-partner-build`; this is not a deployed build.
- Locale parity passed. Reference gate passed with zero errors, 96 dynamic calls skipped and one unmapped columns file. An earlier transient SEQ translation error from concurrent edits was resolved before this final gate.

## Runtime and UI

BMS ran through the isolated launcher at `127.0.0.1:6001`, SEQ at `127.0.0.1:7002`, against loopback PostgreSQL with external providers disabled. Normal Credentials sign-in in Chrome was used. Initial navigation timeouts during compilation were retried after the local route became ready.

Three uniquely named disposable fixtures represent a direct APP account with paid Premium and no creator/company, a BMS account with an existing direct gift, and a FREE account. Each has an accepted guardianship over a tenantless memorial and a stored QR destination.

- BMS: empty selection disables confirmation; the dialog names customer/company; cancel keeps the account independent. Confirming links the existing APP account and preserves its Premium end date. The BMS-gift account retains resend/revoke controls. FREE remains FREE after linking.
- PostgreSQL persistence: all three customers retain their IDs, original creator, activation, email/password, unchanged sale rows and original QR rows; only the customer's company/editor change. Their memorials remain tenantless.
- SEQ: all three linked customers appeared in the company's list. The direct APP customer's detail showed its accepted tenantless memorial and Premium expiry. The FREE customer's memorial showed **Disponível no Premium**, with no export button.
- QR export: the contemporaneous SEQ inventory change correctly rejected generation with no stock. After adding a disposable fixture for one previously activated plaque, preview and SVG export succeeded for the APP customer. The 2,918-byte downloaded SVG was rasterized with Sharp and independently decoded with jsQR to the exact original stored destination. The browser download-event waiter timed out, but the file was present on disk and independently verified; screenshots show the preview. This tests re-export of an existing plaque, not new stock allocation.
- Local evidence files are under ignored `.local-qa/consumer-partner/`, including `confirmation.png`, test logs and fixture assertions.

## Boundaries and cleanup

Company linking authorizes the company's existing Sequoia team, not an individual staff member. It is not a plan upgrade, purchase, profile transfer or arbitrary guardianship. Existing QR plan/stock checks remain separate. External mailbox delivery and physical printing were not exercised.

Cleanup completed: fixture customers/memorials, grants/sales and the added plaque were removed; the disposable integration database and its temporary dump were deleted. Owned BMS/SEQ process trees (launcher children 25652 and 38244) were stopped. Only this task's generated TypeScript include paths were removed; shared PostgreSQL and other chats' servers/changes were preserved.
