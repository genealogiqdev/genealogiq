# App conventions (this app's instantiation of the suite's patterns)

> **Last verified against code:** 2026-10-03 at `6e06634` plus current docs/tests/launcher changes. Current feature contracts live in [AGENTS.md](../AGENTS.md). The full original is preserved in [history/CONVENTIONS-2026-10-03.md](history/CONVENTIONS-2026-10-03.md).

Compact reference of the *choices already made* in this codebase, so future entity slices
read this instead of re-deriving conventions from scratch or from ledger prose. This is a
pre-existing, hand-built app (not scaffolded fresh by the nextjs-crud-suite) — several
suite defaults are deliberately overridden below by an established, consistent local
pattern. Where the app's own pattern conflicts with a skill's generic gold, **the app's
pattern wins**; deviations are declared once here rather than re-litigated per slice.

Derived by reading the Places module (`GeoPlace`) end-to-end — schema, migration, schema
factory, queries, actions, upload route, edit form, list client, pages — as the reference
implementation of a profile-owned, guardian-manageable, publicly-gated sub-resource.

## Identity & timestamps (schema)

- **New profile-content IDs follow existing `cuid()` conventions.** The shared schema also contains autoincrement and composite-primary-key models (Favorite/PetOwnership), so it is not universally cuid. Do not change established identifiers solely to match a generic template.
- **Timestamps**: `createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)`
  and `updatedAt DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)`
  (note: `@default(now())` is present on `updatedAt` too, not just `@updatedAt` — matches
  GeoPlace; other models differ, so inspect their declarations).
- **FK naming**: `<entity>Id String @map("<entity>_id") @db.VarChar` + explicit
  `map: "<table>_<entity>_id_fkey"` on the relation, `onDelete: Cascade, onUpdate: NoAction`
  for a profile-owned child row (the row has no meaning once the `AppUser` is gone).
- **GeoPlace owner FK indexed**: `@@index([ownerField], map: "<table>_<entity>_id_idx")`.
- **Table mapping**: `@@map("app_<plural>")` — this prefix applies to the profile-content reference slice; shared BMS/SEQ tables use their own mappings.

## Schema location: ONE shared file, not mirrored per app

`packages/db/prisma/schema.prisma` is the single source of truth for BMS + SEQ + APP. Never
duplicate a model definition per app. Migrations likewise live in ONE
`packages/db/prisma/migrations/` directory (the old "mirror in 3 apps" convention referenced
in old session notes is dead — confirmed no `apps/app/prisma` or `apps/bms/prisma` migration
dirs exist).

## Migrations: hand-authored, idempotent SQL

The reference GeoPlace migrations use hand-authored, guarded SQL. Follow the existing migration conventions for new changes; the historical tree also contains unguarded statements and is not universally idempotent. The reference pattern uses:
`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, and a
`DO $$ BEGIN ALTER TABLE ... ADD CONSTRAINT ...; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`
wrapper for FKs (re-runnable without erroring). Folder name:
`YYYYMMDDHHMMSS_snake_case_description`. **Author schema/migration changes and validate against disposable local data.** Deployed migration work uses the existing Azure jobs/private-database runbook and the task’s explicit authorization; ordinary merge does not auto-run the current workflow_dispatch migration job. See [DATABASE](../../../docs/DATABASE.md) and [AZURE-AGENT-RUNBOOK](../../../docs/AZURE-AGENT-RUNBOOK.md).

## `ActionResult` shape (differs from generic Carlos gold)

This app's shared result type lives in `@genealogiq/core` (`packages/core/src/result.ts`),
**not** a per-app `lib/action-result.ts`, and it is a 3-helper contract, not 2:

```ts
type ActionResult<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; message: string }
done(message?)      // success, toast only (the common case — mirrors savePlace/deletePlace)
ok(data?, message?) // success carrying a typed payload
fail(message)        // failure with a message
```

Import `done`/`fail`/`ok`/`ActionResult` from `@genealogiq/core`. Use `done()` for
create/update/delete actions that only need a toast; reserve `ok(data)` for actions that
return something the caller consumes (e.g. a checkout URL).

## Auth / authorization (this app's own DAL — not Better Auth, not Ana's generic `authz.ts`)

- `verifySession()` from `@/lib/dal` — session guard, redirects if absent (next-auth v5).
- `canManageProfile(profile, sessionUserId)` from `@/lib/profile` — the ONE ownership rule
  for every profile-scoped mutation: `profile.id === sessionUserId` OR an **ACCEPTED**
  guardian. The current helper explicitly rejects PENDING/REJECTED and accepts the legacy missing-status shape; it also accepts unexpected status strings. [MEMORIALS-GUARDIANS](MEMORIALS-GUARDIANS.md) records that mismatch with the older exact-ACCEPTED claim.
- Mutating actions guard shape, always in this order: `verifySession()` →
  `getProfileById(profileId)` + `canManageProfile` check (→ `fail(t("<ns>.notAuthorized"))`) →
  `getXSchema(identityTranslator).safeParse(data)` (→ `fail(t("common.invalidData"))`) → the
  Prisma write. **No `requireRole`/RBAC layer, no rate limiting** on these profile-content
  actions (none of bio/geolocation/places/gallery/tribute actions rate-limit either) — skip
  Ana's `requireWithinRateLimit` unless a slice explicitly asks for it.
- Server Components read `auth()` directly (from `@/auth`) for the viewer id, not
  `verifySession()` — the public profile pages must work for an anonymous viewer.

## Public/anon gating (the two-wall system)

- `assertPublicMemorialAccess(profile, viewerId, profileId)` (`@/lib/public-profile-access`)
  is the entry gate on every `(public)/profile/[id]/**` page: memorials are always public;
  living users are public unless `isPublicProfile === false`; anonymous + not-public →
  redirect to sign-in (never a 404, to avoid existence enumeration); missing id for an
  authed viewer → `notFound()`.
- **Soft wall** — `SignupDialog` (`@/components/auth/signup-dialog`, `dismissible` prop).
  `dismissible={true}`: closable (X, ESC, outside-click), opened on click-interception (e.g.
  Gallery blocks the lightbox open when `gated`). `dismissible={false}`: hard wall, no way to
  close via the dialog itself.
- **Hard wall** — `SignupPrompt` (`@/components/auth/signup-prompt`), a bare
  `<SignupDialog dismissible={false}>` that self-opens once the anon visitor scrolls ~80% of
  the page. Rendered once, as a page-level sibling of `<main>`, gated on `{isAnon && <SignupPrompt />}`.
  Composable with the soft wall on the same page (a list can click-intercept AND
  scroll-lock — see Documents, the first slice to combine both).
- Anonymous list truncation: page fetches `take: isAnon ? ANON_<X>_LIMIT : undefined`; the
  client component takes `gated`/`hasMore` props to decide fake-vs-real "load more" and
  click-vs-open behavior. `ANON_<X>_LIMIT` is a small module-level constant (12 for
  Gallery/Documents/Places, 16 for Tributes) — not configurable, not derived from a feature flag.

## Quota convention (APP-local, always enforced — no more env flags)

**Superseded convention, for history**: quotas used to live as columns on the shared
`Subscription` table and were only enforced behind a per-feature
`process.env.<FEATURE>_ENFORCE_QUOTA === "true"` flag (`GEO_PLACES_ENFORCE_QUOTA`,
`DOCUMENTS_ENFORCE_QUOTA`) — infra shipped ready but stayed inert until a human flipped the
flag. **Both flags are gone.** Quotas are always enforced now.

- **Numbers live on the shared `Subscription` table**, one row per plan, so BMS edits every
  plan attribute without a deploy. `src/lib/plan-quotas.ts` keeps only what is NOT a per-plan
  number: the `PlanQuotas` shape (`treeMaxMembers`, `bioMaxChars`, `mediaMaxImages`,
  `mediaMaxVideos`, `documentsMax`, `geoPlacesMax`, `memorialsMax`, `petsMax`, `qrCodeMax`,
  `geolocationFullAccess`) and the `allowsExtraPurchase(field, tier)` policy. **There is no
  hardcoded plan in this app** — do not add one back; a tier only changeable by deploy is the
  hole this was cleaned up to close. (An earlier revision of this document said the opposite,
  and a `PHYSICAL_QR` constant used to live here; both are gone.)
- **`getMemorialFeatures(profileId)`** (`@/lib/subscription`, `PlanQuotas` return type, `cache()`-wrapped
  per request) resolves the plan: for a living profile, its own live paid `AppSale` (as buyer);
  for a memorial (`APP_MEMO`) or pet (`APP_PET`), **any `ACCEPTED` guardian's own live paid sale
  cascades** (one guardian's subscription covers every memorial they manage; richest plan wins
  when co-guardians differ), otherwise the `FREE` row, which must exist. The old directly assigned memorial/bulk-slot sale fallback was removed in a0aa99b; `getMemorialFeatures` reads live guardian/living sales and current Subscription quotas. Activation may first grant a configured guardian trial; see [GENCODE-ACTIVATION](GENCODE-ACTIVATION.md).
- **A redeemed GenCode is not itself a Subscription tier.** The current activation action may grant a configured guardian trial from order/cycle/plan snapshots; entitlement then resolves through the guardian sale. Physical QR ownership separately unlocks that profile’s QR. Activation bypasses the ordinary memorial cap so the paid physical slot is not charged twice. See [GENCODE-ACTIVATION](GENCODE-ACTIVATION.md) and [BILLING-QUOTAS](BILLING-QUOTAS.md).
- **Combined media pool**: `mediaMaxImages`/`mediaMaxVideos` are ONE shared budget spent across
  Bio's own image, every Gallery item, and every `GeoPlace.photos` entry — computed live via
  `getCombinedMediaUsage(profileId)` (`@/queries/media-usage`), no persisted running total.
  Each contributing action/form fetches the combined usage, subtracts its OWN prior
  contribution (each of Bio/Gallery/Places replaces its entire sub-collection on every save),
  and checks the new submission against what's left (`effectiveMaxImages` in each edit form).
- **Memorial-creation limit**: one shared `getMemorialCreationStatus(guardianId)`
  (`@/lib/memorial-quota`) — do not reintroduce a hardcoded constant or a bespoke count
  elsewhere. Creation is independent of the removed `nextSale`/`maxProfiles` bulk-slot binding (2498328, a0aa99b). That binding is historical and no longer runs.
- **QR Code quota**: `getQrQuotaStatus` ranks the guardian’s own profile and accepted memorials by createdAt against qrCodeMax plus purchased extra units. A target with its own GenCode bypasses rank; the old `physicalQrLicense`/direct AppSale binding is removed. “Which QR is free” remains a nonpersistent rank heuristic. See `src/lib/qr-quota.ts` and its tests.
- **`LimitReachedDialog`** (`@/components/limit-reached-dialog`) is the one reactive UI for
  "you hit your plan's limit" — an `AlertDialog` (mirrors the pre-existing `GeolocationGate`
  pattern), controlled via `open`/`onOpenChange` (not `AlertDialogTrigger` — the calling
  component checks the limit itself, before invoking the mutating action, then opens this).
  Contexts: `"tree" | "bio" | "documents" | "media-images" | "media-videos" | "geoPlaces" |
  "memorials" | "qrCode"`. CTA always links to `/subscriptions`; `allowsExtraPurchase(field, tier)`
  (`plan-quotas.ts`) marks which quota fields (`geoPlacesMax`, `qrCodeMax`, `memorialsMax`)
  additionally offer an à la carte top-up. That purchase flow is **live** — Stripe one-time
  checkout via `@/actions/extra-units.actions`, fulfilled by the webhook into
  `ExtraUnitPurchase`, and added to the plan limit by each quota helper. A new module hitting a hard, unambiguous "this action definitely creates
  one new unit" limit (an add-image handler, a create-new-row button) should reach for this
  dialog rather than a bespoke toast or a hidden button.
- **`UpgradeHint`** (`@/components/upgrade-hint`) is a DIFFERENT, older, passive text hint
  (always-visible near a counter, no user interaction to trigger it) — it coexists with
  `LimitReachedDialog` on purpose, not a duplicate to consolidate. It used to bail out for a
  hardcoded top tier; with that tier gone the hint always renders. If a tier above `PREMIUM` is
  ever added, gate on the plan's price rather than on a code string.

## Caching model: no Cache Components, plain `revalidatePath`

This app does **not** use Next 16 Cache Components / `cacheTag` / `updateTag`. Mutating
actions call `revalidatePath(<the list route>)` (see the current [AGENTS.md](../AGENTS.md) and feature docs). Public
profile sub-pages read `auth()` per-request and are naturally dynamic — no `force-dynamic`
export is used or needed anywhere in `(public)/profile/[id]/**`.

## Form placement: routed profile-content forms, with existing tree dialogs

Every profile sub-resource form in this app (Places, Bio, Geolocation, Memorial) is a
**routed page** (`.../new/page.tsx`, `.../[id]/edit/page.tsx`) rendered inside
`AuroraBackdrop` + a `glass-card` form, with `onSuccess` doing `router.push(list)`. **This
app does not use the suite's "≤8 fields → dialog" threshold** — Places has 8 fields
(title/categories/description/lat/lon/photos/startDate/endDate) and still gets full routed
pages, matching Bio/Geolocation/Memorial. Declared deviation from `shad-form-builder`'s
dialog-below-8 default: **always route, never dialog**, for the established profile-content forms. Family-tree/pet editing also has deliberate node/pet sheets/dialogs; preserve those flows rather than apply this convention to every interaction.

## List UI: a custom `*-client.tsx` component, not Tatiana's TanStack table

Public-profile sub-resource lists (Places, Gallery, Tributes) are **not** server-driven
TanStack tables with URL-state pagination — `tatiana-table-generator`'s pattern does not
apply to this app's public-facing content. Instead: a `'use client'` component takes the
full (or anon-truncated) row array as a prop, renders a grid/list/masonry of cards, and opens
a `<Dialog>` for the detail view. No `page`/`perPage`/`sort` URL params; the "pagination" is
either client-side (`visibleCount` + IntersectionObserver, Gallery) or just a take-limited
query with no further paging (Places, and now Documents). Empty state: an icon + translated
message + (if `isOwn`) a CTA button.

## i18n

- next-intl, **cookie**-based locale (no `[locale]` URL segment). 3 locales:
  `en-US` (default), `pt-BR`, `es-MX`.
- **Top-level namespace keys are alphabetically ordered** in each `messages/<locale>.json`
  (confirmed: `Actions, Auth, Bio, Common, Documents, Errors, FamilyTree, Favorites,
  Feedback, Gallery, Geolocation, Home, InstallPrompt, Legal, Memorialized, Messages, Nav,
  NotFound, Offline, Places, Profile, Push, Qr, Subscriptions, Tributes`) — and **keys within
  each namespace are alphabetically ordered** too (including `cat_*`/`catgroup_*` keys).
- Validation messages come from the shared `Errors` namespace (`required`, `maxChars`,
  `minChars`, `endBeforeStart`, …) via a `Translator` passed into the schema factory — a new
  entity only adds `Errors` keys if it needs a message the shared set doesn't already cover.
  `common.invalidData` (under `Actions`) is the generic server-side-validation-failed toast.
- Server-error toasts for a new entity's actions go under `Actions.<entityNamespace>.*`
  (`notAuthorized`, `notFound`, `limitReached`), alongside the sibling entities' blocks
  (`Actions.places.*`, `Actions.bio.*`, …), inserted alphabetically among Actions' top keys.
  The entity's own `<Entity>` namespace holds everything UI-facing: field labels,
  placeholders, toasts (`toasts.saved`/`deleted`/`reset`/`fixFields`/`uploadFailed`/
  `unsupportedFile`/`waitForUploads`), delete-confirm dialog copy, category labels
  (`cat_<key>`), page titles.
- Run both `node scripts/check-i18n-parity.mjs` (cross-locale key parity) AND
  `node scripts/check-i18n-keys.mjs` (double-nest + missing-namespace detection) from the
  monorepo root after touching any `messages/*.json` — both are wired as `pnpm check:i18n-parity`
  / `pnpm check:i18n-keys` at the repo root.

## Uploads (Azure Blob)

One route per feature under `src/app/api/<feature>/upload/route.ts`, using
`readMediaUploadBody` and `processMediaUpload` from
`@genealogiq/services/media-storage`. Browser clients use
`uploadMedia` from `@genealogiq/core`: the route authorizes a single
server-generated object key, the browser PUTs directly with a short-lived SAS,
and the route verifies the stored size, content type, and file signature.

- **Ownership-scoped** (profile-owned media — Places/Bio/Gallery/Tribute/**Documents**):
  each request re-derives the session via `auth()`, parses+validates a
  `clientPayload` of `{ profileId }` (a small `parseClientPayload` helper that throws on
  missing/malformed JSON), loads the profile's `guardedBy` (`status: "ACCEPTED"` pre-filtered
  in the `select`), and checks `canManageProfile`.
- **Anonymous, unscoped** (career/CV upload): apply an IP rate limit as well as
  content constraints.
- **Content verification**: completion reads the object through the Azure SDK
  and verifies its magic bytes. Invalid uploads are deleted before their URL is
  returned to the form.
- Persisted Azure URLs must match `MEDIA_PUBLIC_BASE_URL`. Legacy Vercel URLs
  remain accepted only for the migration/rollback window.
- Perform the database mutation before calling `deleteBlobs(urls)`;
  `deleteBlobs` removes only URLs no longer referenced by another record.

## Boundary files (Bruna's step): no-op for public profile sub-segments

`(public)/loading.tsx`, `(public)/error.tsx`, `(public)/not-found.tsx` already cover every
route under `profile/[id]/**` — **no sibling module** (bio, gallery, places, tributes,
geolocation, memorialized, qr-code) has its own segment-level `loading.tsx`/`error.tsx`/
`not-found.tsx`, including ones with dedicated list+detail+edit routes. A new profile
sub-resource follows the same precedent: do not add per-segment boundary files unless a
slice explicitly asks for one. (The group-level `(public)/loading.tsx` skeleton is shaped for
the bento-grid profile page specifically, so it's a loose match for sub-pages — a
pre-existing characteristic of every sibling module, not something a new entity should fix
unilaterally.)

## Gates actually available in this repo

There is no `check-skill-contracts.mjs` here (this is not a suite-scaffolded app — no
generic `lib/action-result.ts`/`lib/list-params.ts`/`lib/authz.ts` contracts to check). The
deterministic gates that exist and apply, run from the monorepo root unless noted:

```
pnpm --filter @genealogiq/app typecheck     # tsc --noEmit
pnpm --filter @genealogiq/app lint          # eslint
pnpm --filter @genealogiq/app test          # vitest run
pnpm check:i18n-parity                       # cross-locale key parity (all apps)
pnpm check:i18n-keys                         # double-nest / missing-namespace check (all apps)
node scripts/check-schema-parity.mjs         # N/A now — single shared schema.prisma; script
                                              # predates the packages/db consolidation, kept
                                              # for history, need not be run for new entities
```

The verified machine has `pnpm` 9.15.0 on PATH. Use the packageManager-pinned version; Corepack activation is a fallback if absent.

## Deviations from suite gold (accepted, do not re-litigate)

- **IDs**: preserve existing cuid, autoincrement and composite-key shapes; new profile-content entities follow cuid.
- **`ActionResult`**: 3-helper `done`/`ok`/`fail` contract from `@genealogiq/core` with an
  optional `data` payload, not the 2-helper `ok(id)`/`fail(message)` shape in Carlos's gold.
- **No RBAC/rate-limiting layer** (Ana's `requireRole`/`requireWithinRateLimit`) on profile
  sub-resource actions — ownership (`canManageProfile`) is the only gate. Add rate limiting
  only if a slice explicitly calls for it on a specific action.
- **Caching**: plain `revalidatePath`, not Cache Components' `cacheTag`/`updateTag`.
- **Form placement**: routed profile-content forms; existing family-tree/pet dialogs are intentional exceptions.
- **No TanStack table for public content lists**: a custom `*-client.tsx` grid/list
  component instead of `tatiana-table-generator`'s table (that skill's pattern is reserved
  for — if this app ever grows one — an internal/admin CRUD table; none exists yet).
- **No per-segment boundary files** under `profile/[id]/**` — the `(public)` group-level
  ones cover every sub-route.

## Verification log

| Date | Revision | Scope | Mismatch / action |
| --- | --- | --- | --- |
| 2026-10-03 | 6e06634 + working changes | Source + available checks | Corrected universal-ID/table assertions, guardian status, removed bulk-sale/QR fields, activation trial, form exceptions, schema gate and pnpm PATH. Tests/runtime/UI remain scoped by feature docs. |
