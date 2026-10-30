# APP memorial cover GenCode shortcut — 2026-10-30

## Scope and source

Starting revision: `011968c`, branch `main`. The working tree already contained
SEQ QR stock work and generated tsconfig changes; this change preserves them.
Reviewed the profile/banner/export route, accepted guardian projection, live
subscription resolution and QR quota policy, including changes since `6e06634`.
No schema, mutation, provider or inventory contract changes are needed.

The memorial cover now links to `/profile/<id>/qr-code` with a QR icon and
localized GenCode label, beside the guardian. The server gates it on human
memorial, accepted viewing guardian and that viewer's live Premium plan.
The destination retains independent session, guardianship and quota checks.
Pet download controls, living profiles and existing physical plaque access
are unchanged. See [PUBLIC-PROFILES](../../apps/app/docs/PUBLIC-PROFILES.md).

## Automated evidence

- Eight page/banner regressions pass: Premium guardian, missing coordinates
  and plaque, Free guardian with Premium co-guardian, Free physical plaque,
  anonymous/unrelated viewers, expiration, living profiles and pet controls.
- Existing QR quota and shared download specs: 13 passing tests.
- Full `pnpm test`: 160 files, 1,505 tests passed; nine integration files / 61
  tests skipped because opt-in prerequisites were not enabled.
- APP typecheck passed. Locale parity and locale reference checks passed.
- APP ESLint: zero errors, eight existing warnings outside the changed files.
- Documentation check passed: four guides, 40 indexed features and 2,710 links.
- `git diff --check` passed for the changed feature files.
- Isolated APP production build passed compilation, TypeScript, page data
  collection and prerendering. No standalone packaging or cloud deployment was
  performed; local QA output intentionally omits standalone copying.

## Local runtime and UI

Launcher: `node scripts/local-qa.mjs --app=app --port-offset=1800 --host=127.0.0.1`.
Existing loopback PostgreSQL/Azurite containers were reused. No cloud provider
keys were enabled. Signed in normally with the documented local Credentials
account; independently read its active Premium term through 2027-10-29 and
accepted guardian relationship to `clocalgrandfather000000001` (Antônio Silva).

Chrome showed the QR icon and GenCode link beside the guardian, without resting
coordinates or a physical plaque. Clicking it opened the existing six QR
presets with PNG/SVG controls and the expected localhost profile destination.
Reloading the export page and returning/reloading the profile retained access.
Screenshot: ignored `.local-qa/memorial-gencode-desktop.png`.

The shortcut is read-only; no profile, subscription, GenCode or inventory rows
were changed. File download behavior has existing regression evidence; this
task exercised navigation and did not claim a new physical-device scan or file
download test. Free/unrelated viewer states were exercised deterministically;
their separate interactive sessions and mobile layout remain untested.

## Boundary, build and cleanup

After normal sign-out, Chrome still opened the public memorial and showed no
GenCode link. Direct navigation to its export URL redirected to `/sign-in`.
Local readiness returned `{"status":"ready"}` separately from these UI checks.

Stopped the owned launcher and confirmed no listener remained on port 4800.
The pre-existing PostgreSQL/Azurite services were left running. Build output
uses `.next-qa-memorial-gencode-build` with the launcher's loopback/provider
overlay and completed successfully. Removed only this task's generated
`.next-qa-4800` and `.next-qa-memorial-gencode-build` tsconfig include entries,
preserving other working-tree edits. Build output, logs and screenshot remain
in ignored local QA paths.
