# APP pet QR file delivery — 2026-10-29

## Source

Starting revision: `f61444c`, branch `main`. Reviewed root/APP guides, PETS, PLACES, PUBLIC-PROFILES, TESTING, LOCAL-DEVELOPMENT and GAPS. `git log 01201a0..HEAD` identified `12bbeb6` introducing direct pet exports; human `qr-code-client.tsx` had no commits since the original guide revision. Concurrent unrelated edits were present during verification.

The screenshot shows an iPhone success toast, not evidence of a saved file. Pet/place controls clicked the server's raw data URL; human PNG converted it to a Blob first and SVG already used a Blob. Both paths reported “downloaded” after clicking a link. The shared `download-file.ts` now handles file delivery, rejects empty/unsupported downloads and delays object-URL revocation by 60 seconds. Both UIs report initiation, explain browser downloads/iPhone Files and keep existing destination, filename and authorization contracts. No server action, quota, database schema or provider behavior changed.

## Automated and static evidence

- Focused run: 4 files / 55 tests passed, including 15 new file/DOM expectations. They pin actual SVG text, PNG binary signature, MIME/filename, connected download anchor, deferred URL release, cleanup on click failure, shared human/pet/place delivery, Premium denial, conversion retry and pending controls.
- Full suite at the concurrent working snapshot: 151 files / 1,427 tests passed; 1 BMS consumer resend test failed on the unrelated `tenantId: null` expectation; 8 opt-in files / 52 tests skipped. That failure is not a QR regression or a full-suite pass.
- Prisma generation, APP TypeScript and focused ESLint passed. i18n key gate passed; parity passed after a concurrent pet-avatar translation edit completed.
- React review: browser APIs remain in click handlers/client imports; server Premium checks retained; pending formats disabled; the helper adds no dependency. SVG cannot be downloaded before its text exists.
- Documentation checks passed. The isolated APP production build was attempted with local DB/provider-disabled configuration but did not finish compilation during concurrent builds and memory pressure (about 1 GB free of 16 GB). Stopped only its identified Next build PID 37920 and descendants to release resources; this is an incomplete build check, not a pass or a diagnosed source failure. Run the APP build again when the shared workstation is available.

## Runtime and browser evidence

- Started the repository PostgreSQL container; its public schema had zero tables. Applied the canonical schema and guarded local seed against `127.0.0.1:5432/genealogiq`, then started only APP with `node scripts/local-qa.mjs --app=app --port-offset=4000 --host=127.0.0.1` (owned child PID 19952).
- Signed in normally with the seeded Credentials identity in the Chrome integration. Rex displayed both formats and the download-location hint, including the Portuguese text after the local fixture locale changed during concurrent work.
- Boundary: the first export encountered an invalidated session and returned to sign-in without a file. Logs reported a nonmatching session decryption secret while other local APP sessions were active on the same host; this matches the documented cross-port cookie collision. A fresh normal sign-in recovered the session.
- Actual PNG: Chrome wrote `C:/Users/Tiger/Downloads/gencode-clocalpetrex000000000000001.png` (23,100 bytes). Independent `pngjs` + `jsqr` decoding found `http://127.0.0.1:7000/profile/clocalpetrex000000000000001`. The renderer's requested width remains 2048; the existing QR encoder produces 2047 × 2047 for this module grid. This change does not alter rendering dimensions. The integration's download-event wait timed out despite the file being present, so evidence is the actual file and decoded target, not that event.
- Independent local DB read still found Rex as `APP_PET` with zero GeoPlaces after export. No QR mutation was added; the export remains read-only.
- Actual SVG/human comparison and reload were not completed: Chrome subsequently reported `Debugger unattached`, including after reacquiring the known tab. Their mocked byte/delivery contracts passed, but they are not recorded as browser passes. Real Safari/iPhone verification is not available on this Windows host.

## Cleanup and publication

Stopped only owned APP PID 19952 and its child tree. PostgreSQL remains available because other concurrent local tasks now use it; fixture data and other servers were preserved. The downloaded local-test PNG remains available as evidence. Build output and test logs use ignored local QA paths. No cloud deployment or production data change was requested by this task.

The starting branch is `main`, which is also the repository's default base. The user was asked to resolve the conflict between maintaining that branch and creating a PR before publication.

Implementation committed locally as `ada4f27`. Only this task's source, tests, translation keys and feature-document portions were included; concurrent changes were preserved. Removed this task's generated `.next-qa-7000` TypeScript include entries, retaining other sessions' entries. No push or PR was performed while the publication choice remained pending.
