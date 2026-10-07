# APP stored-text investigation — 2026-10-07

> **Update after approval:** The 67 proposed field repairs were applied and
> independently verified on 2026-10-07. Seven audited fields still contain
> unresolved characters. See [approved production application](#approved-production-application).

## Initial outcome and scope

The reported document titles are already stored with ASCII question marks.
Current source, normal form submission and PostgreSQL round trips preserve
accented text. Production data recovery is pending review/application of a
private manifest; this audit does not report the production incident as fixed.

Work started on main at 218d5aa. Source changes since the feature documents'
6e06634 baseline were checked, including current uncommitted files. Other chats
were concurrently changing subscriptions, coupons, email handling and local QA
configuration. Their changes and processes are not part of this repair commit.

## Source evidence

- The profile root fetches getDocumentsByUserId and passes Document.title to
  DocumentsPreview in apps/app/src/components/card-previews.tsx.
- The collection and detail in documents-client.tsx and document-edit-form.tsx
  use the same stored title, description and fileName.
- saveDocument verifies the normal session and owner/guardian, validates with
  getDocumentSchema, checks the existing row/profile and writes the parsed
  Unicode values. No ASCII conversion exists on this path.
- The initial scan decoded all nine locale files as strict UTF-8 and inspected
  9,126 leaf strings; no replacement/word-internal question-mark or common
  mojibake signature was found. The title/subtitle translations in the reported
  card are distinct from the persisted document names.
- The repair command uses an allowlist and a reviewed before/after manifest.
  matchesLostUtf8 checks the byte-loss signature while preserving intact
  characters. It cannot establish an unknown original spelling.

## Live database evidence — read only

The existing private Azure database task runner was used after checking the
subscription. The workstation did not retrieve database credentials. Every
diagnostic transaction was READ ONLY and ended with ROLLBACK.

The initial audit checked 147 noncredential APP content columns. PostgreSQL
server_encoding and client_encoding were both UTF8. The focused command audit
confirmed 72 affected values in 23 columns:

| Table | Affected text values |
| --- | ---: |
| app_bios | 5 |
| app_documents | 3 |
| app_gallery_items | 10 |
| app_geo_places | 17 |
| app_geolocations | 2 |
| app_tributes | 3 |
| app_users | 32 |

The two document titles match the user's screenshot:
"CNH - carteira de habilita????o" and "Cart??o INSS". The live script executions
were 6ok4qey (initial audit), hoibyi5 (a long diagnostic line was truncated),
j5903mt (one record per line; complete audit), and 5o4qagq (repair preview), all
under job-genealogiq-migrate-prod. Durable Log Analytics output was used where
the completed job's ephemeral replica was no longer available.

The local pre-Azure dump was inspected as bytes through pg_restore without
restoring it into any database. It has zero rows in the six affected content
tables and one app_users row, with no matching original text. The user's Azure
identity could not list the private backup container; no storage permissions
were expanded. The historical writer/import responsible for the loss remains
unestablished.

A private review proposes changes to 67 fields and preserves five ambiguous
name/address values. Two proposed biography repairs still retain unknown
symbols. These are spelling proposals, not originals recovered from backup.
Raw user content, proposed values and manifests remain under ignored .local-qa,
not in Git.

The complete manifest preview in execution 5o4qagq reported 67 pending repairs:
every current value still matched its reviewed before-value, and the read-only
transaction made no updates. This verifies applicability, not the inferred
spelling or authorization to apply it.

## Automated evidence

| Check | Observed result | Meaning |
| --- | --- | --- |
| Document schema/action specs | 24 passed | Literal accented titles, descriptions and file names reach the write boundary; intentional punctuation survives; existing guards remain covered |
| node --test scripts/azure/tests/repair-app-text.test.cjs | 12 passed | Strict UTF-8, allowed fields, intact text, dry-run, missing/stale targets, atomic rollback, idempotence and receipt-limited undo |
| pnpm test | 104 files / 894 tests passed; two files / six tests skipped | Complete current workspace suite, including concurrent changes; the five coupon integrations and one Azurite integration were not enabled |
| pnpm check:i18n-parity | Passed for all nine locales | Locale key sets agree |
| pnpm check:i18n-keys | One error; 83 dynamic calls skipped and one unmapped file | Concurrent BMS manual-coupon-form.tsx references missing ManualCoupons.manageAccess; unrelated to this repair and left with that ongoing change |
| node scripts/check-docs.mjs / git diff --check | Passed | Documentation contracts, source links and patch whitespace |
| App build / Prisma migration | Not run for this change | No app runtime module, bundle contract or database schema was changed by this repair |

## Local runtime evidence

Two disposable private document rows were inserted for the normal seeded
consumer, using this task's unique accent-qa-20261007 identifiers. Their file
references were synthetic fixtures; no PDF bytes or cloud media were uploaded.

Independent PostgreSQL assertions verified:

1. The UI-saved title is exactly "CNH - carteira de habilitação"; the saved
   description includes "Certidão, cartão, avó, avô e informações de São José."
   and its final intentional question mark.
2. A repair preview makes no writes.
3. Applying the manifest changes only the intended remaining title and
   updated_at. Ownership, privacy, category, description and file reference
   retain their previous values.
4. Reapplying makes no writes, including no timestamp changes.
5. Rollback with the apply receipt restores only the row changed by that run;
   it preserves the title that was already corrected through the UI.
6. A batch encountering a later edited value rolls back its earlier update.

The isolated local check script and receipt are retained in ignored .local-qa.
No local reset, reseed or schema change was needed for these document checks.

## Browser evidence and limits

Normal Credentials authentication used the documented disposable local account.
The profile preview and Documents list reproduced both corrupted fixture
titles. The edit form rejected an empty title with "Obrigatório" and
"Corrija os campos destacados.", then saved the accented title/description and
displayed "Documento salvo." with the correct characters.

Initial checks reused identified isolated launchers. Concurrent local sessions
shared the localhost APP cookie and other tasks stopped/restarted their servers.
Final verification used this task's own port 3300 with consistent
127.0.0.1 APP_URL/AUTH_URL values and a separate .next-qa-3300 output directory.
This preserves normal authentication while isolating the browser cookie from
other localhost sessions.

Fresh profile and Documents reloads both displayed "CNH - carteira de
habilitação" and "Cartão INSS". The collection retained the accented description
and the intentional question mark in "Qual versão?". Browser screenshots
accent-profile-verified.jpg and accent-documents-verified.jpg are retained under
ignored .local-qa; the visible glyphs were inspected as well as the DOM text.

The private-blob access gap, upload/download bytes, all other feature workflows
and production authenticated UI are outside this text-only verification.

## Cleanup

Both owned private document fixtures were deleted with exact IDs, the seeded
owner and fixture file name as guards; a subsequent count confirmed zero
remaining rows. No real document or media object was removed.

Only this task's port 3300 Next process trees were stopped (the first localhost
instance and the final 127.0.0.1 instance). Port 3300 generated TypeScript entries
were removed while retaining the other task's existing port 4000 references.
Shared PostgreSQL/Azurite and other tasks' servers were left running. The
ignored review manifest, local receipts and screenshots remain available.

## Remaining work recorded before approval

Review the private proposed values, including names reconstructed from context;
confirm unknown originals where available. Apply only within the authorized
production scope, retain the successful receipt, independently verify changed
rows and reload the affected product views. An application deployment or a
translation change alone will not repair the existing question marks.

## Approved production application

The user approved the presented 67-field proposal with "Sim, pode aplicar".
The branch remained main, at 074d7bd after the earlier repair commit 9253152.
The repair script, private task runner and document read/write/render paths had
no intervening source changes. The approved manifest matched the original
read-only preview exactly:

    af6797b8c882d3600ed8b2f9ef825b5ad377a923d2619281eb02a46179c862b2

Execution job-genealogiq-migrate-prod-0hno8k3 succeeded on 2026-10-07 at
13:55:07 America/Sao_Paulo (16:55:07Z). Its successful apply receipt reports
67 updated text fields across 49 rows in the seven audited APP tables. The
receipt is retained privately as .local-qa/accent-production-apply-receipt.json.
The three document fields are fully restored: both reported titles and the
CNH description. This was a guarded data update; no deployment or schema change
was required.

A separate script used explicit READ ONLY SELECTs, without calling repairText,
to compare every original audit target with its approved expected value.
Execution job-genealogiq-migrate-prod-acw9o10 succeeded and reported:

| Independent production check | Observed result |
| --- | --- |
| Original audited fields compared | 72 |
| Approved changed fields | 67, all equal to the approved after-values |
| Excluded fields compared with their original values | Five, all unchanged |
| Missing rows or value mismatches | Zero |
| Fields still containing unresolved characters | Seven: five untouched fields and two partially restored biographies |
| Reported documents' visibility | Both remain is_public=false |

The independent verification is retained privately as
.local-qa/accent-production-verification.json. The unchanged fields contain four
ambiguous given names and one street name; the two biographies retain unknown
symbols. These originals are still needed, so DATABASE-G2 remains open.

The production public profile rendered a restored family-name accent while
preserving an unresolved given-name segment. Both the profile preview and the
Documents collection continued to hide the private documents from an anonymous
viewer. An authenticated owner session was unavailable, so production owner UI
verification is n/a; the exact document values are verified in PostgreSQL, and
the same save/reload display path passed the local happy/boundary checks above.
No document bytes, access settings or production credentials were exposed.

The prepared command's 12 tests, 24 document specs and local PostgreSQL/UI
evidence from 9253152 remain applicable; no implementation changed in this
follow-up. The two private jobs completed, and no additional local product
server or disposable database fixtures were started for this application.
The temporary browser tab was closed; its privacy-boundary screenshot remains
in .local-qa/accent-production-documents-privacy.jpg.

Follow-up checks passed: documentation validation (four guides, 39 features,
2,295 local links and 161 named references), git diff --check, and the locale
reference gate (zero errors; 83 dynamic calls skipped and one unmapped file).
The earlier missing BMS coupon key is resolved in the intervening source.

## Related

[Database recovery runbook](../DATABASE.md#recover-damaged-app-text) ·
[Document contracts and gap](../../apps/app/docs/DOCUMENTS.md) ·
[Tests](../TESTING.md) · [Local QA](../LOCAL-DEVELOPMENT.md)
