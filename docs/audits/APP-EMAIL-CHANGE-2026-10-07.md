# APP email-change submission — 2026-10-07

## Scope and source evidence

The reported screenshot showed the profile editor's “Corrija os campos destacados.” toast after submitting the email dialog, without an error on either dialog field. At starting revision `218d5aa`, `ChangeEmailDialog` was a React descendant of `MemorialEditForm`. The dialog portal did not stop React submit propagation; the outer React Hook Form handler cancelled the email action and validated the profile instead.

The fix adds `stopPropagation` to the email form's submit handler while preserving `action={dispatch}`. No account schema, password, session, rate-limit or provider policy changed. History for the affected dialog/action/form/shared-schema paths was checked from the earlier `6e06634` verification. Concurrent changes elsewhere in the shared `main` checkout are not part of this fix.

## Automated evidence

- The two tests in `apps/app/src/components/auth/change-email-dialog.test.tsx` both failed before the fix because the parent submit callback ran. They passed after the fix, with the actual React form action, actual Dialog portal and mocked action/translation boundaries.
- The success expectation is an independently specified `{ newEmail, currentPassword }` payload, exactly one email action, no parent submit and an unchanged profile draft. The failure expectation is the returned password error next to the password input, with `aria-invalid=true` and the submit control enabled again.
- `pnpm test`: 102 files / 842 tests passed; one opt-in Azurite file/test skipped. This run does not count that skip as a pass.
- `pnpm --filter @genealogiq/app typecheck`: passed.
- `pnpm --filter @genealogiq/app lint`: passed with eight existing warnings and zero errors.
- `pnpm --filter @genealogiq/app build`: passed, including production compilation, TypeScript and page generation, after stopping the dev server.
- Prisma generation ran once as the package installation's normal postinstall. The new happy-dom dependency is for the component tests only.

## Runtime evidence

The normal local Credentials fixture was used; the screenshot's personal credentials were not used. Existing services on ports 3000/3001 belonged to another workspace, and 3100 was also occupied. An ignored wrapper reused the checked-in `scripts/local-qa.mjs` isolation overlay with APP on `http://localhost:3200`. PostgreSQL remained the repository's loopback `genealogiq` database. The wrapper supplied a dummy mail key and `RESEND_BASE_URL=http://127.0.0.1:3105`, where a capture server accepted only `@genealogiq.test` recipients and never forwarded mail. Other cloud-provider keys remained disabled, and no `.env` file was changed.

| Scenario | Independent expected result | Observed result |
| --- | --- | --- |
| Normal sign-in | Seeded Credentials account reaches `/home` | Passed |
| Incomplete profile and unsaved name | Email form is independent of missing birth/gender fields and the `Local Email Draft` name | Email action ran; profile validation toast did not appear; draft remained in the form |
| Wrong current password, submitted by button | Inline “Senha incorreta”; no token, profile write or captured message | Passed; database still held `first_name=Local` and the original email, with zero pending tokens |
| Valid email request, submitted by Enter | Link-sent message; exactly one pending token; original email remains active | Passed; local mail sink captured the SDK request; persisted token hash matched SHA-256 of the captured link and had a future expiry |
| Captured confirmation link | “E-mail alterado!”; new stored email; token consumed | Passed; database held `local-email-change@genealogiq.test` and zero pending `CHANGE` tokens |
| Profile reload | Unsaved name is discarded, stored name remains `Local` | Passed |
| Restore fixture through button submission and confirmation | Original `local-admin@genealogiq.test` email; name `Local`; no pending `CHANGE` token | Passed in the browser and an independent SQL query |

The transport capture is an isolated provider fixture. Real Resend acceptance, inbox delivery and provider rejection handling were not tested. The existing [EMAIL-DELIVERY-G1](../EMAIL-DELIVERY.md#gaps-and-fixes) and [ACCOUNTS-G1](../../apps/app/docs/ACCOUNTS.md#gaps-and-fixes) remain open.

An additional sign-out/anonymous-route attempt was inconclusive while another browser flow was using this same local app/session. It is not counted as an authentication-boundary or new-address login pass. The wrong-password boundary above was independently exercised and verified in the database.

## Browser evidence

Ignored local screenshots are stored under `.local-qa/2026-10-07/email-change/`:

- `wrong-password.png`: password error in the dialog.
- `link-sent.png`: successful request with no profile-validation toast.
- `confirmed.png`: confirmation page after consuming the actual captured token.

Raw mail capture and token links stay in ignored local artifacts, outside tracked documentation. The user-facing screenshot shows only disposable test data.

## Cleanup and remaining checks

The test account was restored through the normal request/confirmation flow. The final SQL check found `first_name=Local`, `email=local-admin@genealogiq.test`, a verified email and zero pending `CHANGE` tokens. No direct account restoration write or authentication bypass was used.

The task's APP/mail-fixture launcher was stopped with Ctrl+C; owned launcher PID 42400 and Next CLI PID 28736 were confirmed absent before building, and ports 3200/3105 no longer listened. Pre-existing Docker services/volumes and other tasks' runtimes were preserved. No push or deployment was performed.

`node scripts/check-docs.mjs` initially passed with four guides, 39 features, 2226 local links and 161 named source references. A later shared-working-tree run found two links from an unrelated concurrent `DOCUMENTS.md` edit to an audit that had not yet been created. Final validation therefore used a temporary `git checkout-index` snapshot of the staged email fix and its base: all checks passed with 2224 links and 161 named references. The snapshot did not create a branch or alter other tasks' files. `git diff --check` passed for this change. The production build passed with explicit loopback database/storage settings and disabled external provider credentials.

## Related

[Consumer accounts](../../apps/app/docs/ACCOUNTS.md) · [Testing](../TESTING.md) · [Local development](../LOCAL-DEVELOPMENT.md)
