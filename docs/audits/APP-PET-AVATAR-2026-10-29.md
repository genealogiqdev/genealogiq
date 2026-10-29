# APP desktop pet portrait audit — 2026-10-29

## Source and scope

Starting revision: `f61444c`, branch `main`. Other chats were editing unrelated code, shared APP locales and PETS documentation during this run; their source changes are outside this portrait audit.

The supplied screenshot shows “Could not load image” on the pet edit form. That exact string originated in `image-compress.ts`, before any `/api/bio/upload` request. The original file was unavailable and its format was unknown; the user noted SVG was possible. This audit does not identify the original codec or prove that the file itself is valid.

Changes:

- Retry failed object-URL decoding through FileReader bytes; do not upload an image both paths cannot decode.
- Normalize missing/generic MIME metadata for recognized desktop image extensions; preserve PNG transparency and GIF animation.
- Offer JPG, PNG, WebP, GIF and SVG in pet create/edit. SVG is always rasterized to PNG at at most 512 px, including small SVGs. A missing context/failed encoder rejects instead of forwarding raw SVG.
- Keep the current form portrait until upload succeeds. Failed subsequent selections preserve the last successful upload and allow same-file retry. Show translated read/upload errors.

Entry `/profile/[id]/edit` → normal APP Credentials session and owner/accepted guardian scope → `PetEditForm` → compression → `/api/bio/upload` authorize/complete → existing scoped storage validation → `updatePet` and Zod media reference → `AppUser.avatarUrl`. Creation retains the `pending/<actor>/create-pet` prefix. Authorization, server MIME/signature/size checks, ownership and schema are unchanged.

## Automated evidence

- Focused run: 39 tests passed across compressor (10), pet form DOM (8), pet actions (16) and bio upload route (5). DOM tests use literal scope/MIME/URL and Portuguese error expectations; compressor tests simulate browser decoding rather than claiming real codec coverage.
- `pnpm test`: 157 files / 1,478 tests passed, 8 opt-in files / 52 tests skipped. This is the concurrently available workspace snapshot.
- APP TypeScript (`tsc --noEmit --incremental false`) and focused ESLint passed.
- Both i18n gates passed; the reference check retained 96 dynamic skips and one unmapped columns file.
- Real Azurite integration: 1 test passed, covering scoped upload, validation, public read, overwrite rejection and cleanup. This exercises storage, not a browser codec.
- Documentation checker passed after the concurrent BMS audit file was created: 4 guides, 40 features and 2,706 links. The earlier transient missing BMS link was not a portrait regression. Diff whitespace check passed.
- An isolated provider-disabled APP production build (`--webpack`, `.next-qa-pet-avatar-build`) was started after stopping the owned dev server. Its result is recorded separately below.

## Runtime and UI evidence

PostgreSQL was already running. This run started repository Azurite without recreating PostgreSQL. The first APP launcher rejected reserved port 6000 and exited. The owned second launcher used `127.0.0.1:6100` with providers disabled and isolated `.next-qa-6100` output.

Normal Credentials login succeeded in Google Chrome. Home showed Rex; opening Rex and its edit form returned HTTP 200 and rendered the expected current name, species, owners and image control. No portrait write occurred.

SVG file selection was attempted with an ignored, hand-authored local image fixture. Chrome's extension refused `setFiles` because “Allow access to file URLs” was disabled. The documented native-picker fallback was then attempted, but Computer Use stopped because it could not confidently determine Chrome's current URL. No further UI automation was attempted.

**Remaining UI acceptance (n/a):** actual SVG/JPG/PNG decode/upload, visible portrait, save/reload and database persistence; corrupt-file feedback with preserved photo; unsupported HEIC and forbidden-profile interaction. The desktop Mac/PWA from the screenshot and the original file also remain untested. The passing mocks, login and form rendering do not establish those scenarios.

## Cleanup and publication

The owned APP launcher and its child processes were stopped. Rex's original `avatarUrl` was null and no avatar upload/save occurred; no profile restoration is needed. Local tests/fixtures/logs remain ignored under `.local-qa/pet-avatar-2026-10-29`. PostgreSQL and Azurite are shared with concurrent local work and are retained. Only this run's generated tsconfig includes are removed after checks; other tasks' output/includes are preserved.

GitHub repository verified as `genealogiqdev/genealogiq`; default branch and starting checkout are both `main`. A fresh fetch confirmed ten prior local commits beyond `origin/main`; there is no open PR from `main`. GitHub cannot create a PR from `main` into itself. Publication must resolve that branch conflict without silently switching the checkout or publishing the other pending release commits.
