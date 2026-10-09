# SEQ memorial quotas and QR downloads — 2026-10-09

## Request and scope

The customer describes memorials as profiles under their care: FREE permits one human memorial without an included headstone GenCode; PREMIUM permits five human memorials and five pets. The SEQ customer table also reported an error or missing QR after **Baixar**.

Work started on `main` at `08b2b1c`. The existing inline-download fix was already committed as `77d4bc0`; its historical runtime limits remain in [CUSTOMERS-MEMORIALS](../../apps/seq/docs/CUSTOMERS-MEMORIALS.md). Source since the documented revisions and relevant uncommitted changes were checked. This follow-up adds plan semantics and download checks without a database migration, cloud operation, push or deployment.

The working tree also contains independent consumer-access, email/billing and tree-memorial changes. Those are not evidence that this request deployed or that its product acceptance passed.

The final 77-case focused run was repeated successfully after concurrent commit `818c2c6` (tree profile reuse) landed on the same branch.

## Source and contract

- The verified tenant must own the APP_USER customer. Only its accepted APP_MEMO/APP_PET guardianships appear as memorials; death dates are optional, and the linked profile may be tenantless. APP_USER/APP_GHOST and pending/rejected links are excluded by the query.
- Human and pet counts are independent. With zero physical purchases, two humans and one pet on Premium means **3 human slots + 4 pet slots = 7 available**, not zero. Over-quota records remain visible and availability never becomes negative. The plan name, separate usage counts and profile type are displayed.
- The latest active/trialing AppSale with a future period end provides the customer's own Subscription quotas. Otherwise the database FREE row is required. Standard quotas remain Free 1 human/0 pets and Premium 5 humans/5 pets; the local seed now matches Premium 5/5 instead of its old 10/10 fixture values. The seed was not run during this audit.
- Premium QR allocation uses separate human/pet lists, ordered by creation time and ID. It does not consume the personal QR allowance. FREE has no included memorial QR. Existing activated plaques stay unlocked without consuming plan slots; purchased human QR units remain valid. MEMORIAL extra units increase human creation capacity separately. Configured/custom quotas remain data, not hardcoded plan values.
- APP human QR access and SEQ use the same pure policy. APP still keeps the personal Free QR; its locked memorial dialog correctly describes Premium as an upgrade for memorial QR access. The existing public pet-profile export feature retains its own documented viewer gate.
- SEQ opens its existing six-style dialog in place. A server action validates IDs and reloads the customer scope, guardianship and plan on preview and every export. Neither a supplied destination nor a browser entitlement is trusted. The direct edit page retains its original tenant restriction and now uses the same customer download gate. Physical inventory printing remains separate.
- Stored QR destinations are preserved; otherwise the configured APP origin generates the profile URL. Preview/download failures provide retry feedback and no file. Both formats wait for a generated preview. Downloading changes no profiles, QR rows, credits or printed/installed flags.

## Automated tests

Final focused run: **8 files, 77 tests passed**.

```powershell
pnpm exec vitest run --project core --project seq --project app packages/core/src/memorial-qr.test.ts apps/seq/src/queries/customers.test.ts apps/seq/src/actions/memorial-qr.actions.test.ts apps/seq/src/components/memorialized/qr-code-download-dialog.test.tsx apps/seq/src/components/memorialized/qr-code-presets.test.ts apps/app/src/lib/qr-quota.test.ts apps/app/src/lib/memorial-quota.test.ts apps/app/src/lib/pet-quota.test.ts
```

Handwritten expectations cover Free's first/second human boundary; Premium's fifth/sixth human and pet boundaries; zero GenCode purchases; extra-unit accounting; accepted-only role/tenant query contracts; missing customers; expired plans between preview and export; unauthorized requests; stored/default/configured URLs; empty/failed previews; retry; file MIME/content and real table/dialog clicks. The action/query tests mock persistence and are not a PostgreSQL integration pass.

The full `pnpm test` run reported **1104 passed, 31 failed, 34 skipped** across 118 passing, eight failing and five skipped files. Failures were in existing/concurrent manual-coupon, partner-billing, customer onboarding, sale email, extra-unit, Stripe and tree-picker changes outside this patch. Examples: missing `$transaction` in old mocks, missing sale-notification recipients and missing `useLocale` in a tree-picker mock. The passing focused run above is the evidence for this feature; the full suite is not reported as passing.

## Real QR bytes and decoder evidence

The first independent read detected that the old Soft foreground `#7B90AB` on `#F5F1EA` failed decoding for the literal human-profile URL. Foreground `#53657F` fixes that failure. All presets use four quiet-zone modules and H error correction.

The permanent encoding spec uses the production palette/options and an independent jsQR 1.4.0 decoder. Eighteen real PNGs (six styles × human, pet and stored-code destinations) decode to their literal expected URLs. SVG output contains vector paths rather than an embedded bitmap.

A separate local check also rasterized every SVG through Sharp and decoded it. **All 36 PNG/SVG files decoded to the expected destination**, including inverted and Soft styles. PNG's requested width is 1024; the encoder's fractional module scaling yields 1023 or 1024 square pixels for these URLs. No claim is made that a photo of a physical plaque or a specific phone camera was tested. Temporary samples, decoder package and sanitized results are under ignored `.local-qa/2026-10-09/seq-memorials/`.

## Static checks and builds

Prisma was generated once against the canonical schema without connecting to a database. APP and SEQ TypeScript checks passed. Final lint passed with zero errors: 20 existing warnings in SEQ and eight in APP, none introduced by this change. Locale key parity, schema parity and documentation contracts passed. The locale-reference gate reported five errors in pre-existing/concurrent SEQ onboarding/sale email actions (`createdEmailPending`, `inactiveEmail`, `emailPending`, `soldEmailPending`), with 88 dynamic calls skipped; this gate is not reported as passing. The changed QR messages are exercised in the Portuguese DOM tests. Subscription offer copy now labels the separate personal QR explicitly in all three languages.

Both **SEQ and APP provider-disabled production builds passed**, serially, with separate app-local `.next-qa-memorials-20261009` output. This is compilation evidence only. Local QA mode omits standalone copying, so this is not a production container packaging check. Logs are retained in the ignored evidence directory.

## Runtime, UI and persistence

**Unavailable, not passed.** PostgreSQL was not listening on 5432. Docker Desktop rejected the configured pipe with access denied. `node scripts/local-qa.mjs --app=seq` refused to start before creating an app process because the local database was unavailable.

Chrome discovery found the configured Chrome integrations but returned **Codex auth token is unavailable** for both. Reconnection and Docker recovery were requested while source/test work continued. No built-in browser was opened as a fallback. No normal Credentials session, live customer page, product file save, save/reload or database persistence check was reached.

Remaining product scenarios:

1. Sign in normally to local SEQ. A Premium tenant customer with two accepted humans and one pet must show 2/5 humans, 1/5 pets, seven available and zero acquired GenCodes. Download PNG/SVG for a tenantless human and pet, close/reopen after filtering, and reload the page.
2. Verify a Free customer's one memorial remains visible with its QR locked. A sixth human and sixth pet remain listed but locked. A pending guardian and another tenant's customer must be absent/denied. Expire the Premium fixture after opening a preview and confirm the export fails without a file.
3. Repeat from an authorized direct memorial detail page. A supplied foreign customer context must be rejected. Verify a stored QR destination and an independently activated plaque after a plan downgrade.
4. Sign in normally to APP and confirm Free creation stops at one human, Premium creation at five humans and five pets, and the fifth human QR works independently of the personal QR. This complements the isolated quota tests.
5. Independently compare profile, guardian, QrCode, GenCode and credit rows before/after downloads; expect no changes. Restore temporary fixtures and stop only owned processes.

## Cleanup and delivery

No database fixtures were created, no existing local rows were edited and no cloud or mail provider was called. The refused launcher owned no product server. Both build processes exited successfully. Automatic approval review rejected the attempted removal of the completed task-owned SEQ output, stating only **blocked by policy**; the output was retained and the rejection was reported to the user. Both app-local temporary build folders and the ignored audit files remain. Only this task's two generated type includes were removed from each app after its build exited, preserving other sessions' entries. Free space was approximately 237 MB after both builds; no further build was started.

The code and documentation are committed on the starting `main` branch; no release is claimed by this audit.
