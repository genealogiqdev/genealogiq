# SEQ B2B buyer segments — November 20, 2026

## Request and source

The user asked for four buyer segments in **Clientes → Empresas B2B**.
B2B means sales from one company to another.
The choices are **Cemitérios**, **Crematórios**, **Memoriais** and **Funerárias**.
The company with SEQ access registers these buyers for direct sales.
The old form showed supplier segments.

Work started on `main` at `084670f` with a clean tree.
The source review included changes since the last B2B review at `d941f5b`.
The stored segment is text. This fix needs no schema change or migration.
A schema describes the stored data. A migration changes that data layout.
The form and server now accept only the four buyer segments.
The English and Spanish choices also use buyer segments.
Old records keep their original values and list labels.
Staff must select a current segment before they save an old record.
The form shows a clear error if the choice is missing.

The BMS partner form and SEQ supplier records keep their own rules.
Sales, stock, credits and staff access do not depend on this segment change.
Other work started in the shared tree during these checks.
This change includes only the SEQ segment files and this audit.

## Automated checks

- The default suite passed: 167 files and 1,567 tests. Ten optional files and 71 tests were skipped.
- The final focused run passed: 33 tests in three files.
- The form tests check the four labels in all three languages.
- The action tests save each current segment on new records and updates.
- Both test groups reject all five old choices. They also check missing choices.
- SEQ TypeScript passed. This check finds incorrect code types.
- SEQ lint passed with no errors and 20 existing warnings. This check finds code rule errors.
- Locale parity and locale references passed. The reference check skips 103 dynamic calls and one unmapped file.

The default suite includes other work in the shared tree.
The final focused run also checks the final initial-selection change.
Optional sale and provider tests were not enabled for this segment fix.

## Local runtime and database checks

Started the documented local PostgreSQL, Azurite and SEQ launcher.
Used the normal local Credentials sign-in through HTTP.
Credentials uses the existing email and password. HTTP sends web requests to the app.
No session token was inserted by hand.
Created one temporary company through the real server action.
Saved `CEMETERY`. Then saved `CREMATORIUM`, `MEMORIAL` and `FUNERAL_HOME`.
Independent PostgreSQL reads and reloaded HTML showed the saved values.
PostgreSQL is the database. HTML is the page content sent by the server.
The new form's HTML contained the four Portuguese choices in the requested order.

All five old values, an empty value and an unknown value failed to save.
The stored value did not change after these failed requests.
A temporary old record showed a disabled selection prompt.
An empty save kept its old value. An explicit new choice saved correctly.
An update for another tenant failed and kept that tenant's data.
A tenant is the company that owns those records.
An anonymous save returned to sign-in and kept the stored value.
The temporary company was removed. Existing company rows were preserved.
Local evidence is stored in `.local-qa/b2b-segments-20261120/`.

These are HTTP and database results. They are not browser UI results.

## Browser limit and next work

The Chrome integration found the installed Chrome connection.
Opening or selecting the local tab failed because Windows denied screen access.
The tool reported `GetCursorPos: Access is denied (0x80070005)`.
The first tab request also timed out.
The agent asked the user to unlock the Windows session and keep Chrome open.
Chrome save/reload and the old-record error are **n/a** in this run.
No built-in browser was used.
The next tester must run these two UI cases in Chrome after screen access is restored.

## Build, release and cleanup

Documentation, schema, migration shape and whitespace checks passed.
The first local build used Turbopack. It stayed in compilation for more than seven minutes.
The agent stopped only that build's process tree. This attempt has no passing result.
A second local build used the supported Webpack option. It also did not finish compilation after several minutes.
The agent stopped only that build's process tree. Neither local attempt is a build pass.
Both builds use local settings with external services disabled.
The GitHub check runs in a clean Linux environment. Its build result is separate from the local attempts.
Read the checks and build logs on [PR #215](https://github.com/genealogiqdev/genealogiq/pull/215) for that result.
The PR is a draft. The Chrome cases remain pending.
The owned SEQ launcher was stopped after the runtime checks.
Shared Docker services were kept for other local work. No volume was removed.
The fix has not been merged or deployed by this task.
The reviewer must review the PR. The release owner must merge and deploy it.

## Later production release

The user authorized merge and deployment later on November 20.
PR #215 is now merged. The four buyer segments are live in SEQ.
The [production release audit](PRODUCTION-RELEASE-2026-11-20.md) records the source, builds and public checks.
Chrome save/reload and the old-record error remain pending.
