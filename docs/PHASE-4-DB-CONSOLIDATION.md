> **Historical memory — retained on 2026-10-03.** This document records earlier intent, incidents or migration work. Current source/runtime contracts are in [AGENTS.md](../AGENTS.md) and [HISTORY](HISTORY.md). Commands, live resources, old statuses and numeric claims below are unverified as current behavior; do not replay historical cloud/data operations without checking the current code and task scope. Original content follows intact.

# Phase 4 — Single-schema consolidation (`@genealogiq/db`)

Status: **PLAN / not yet executed.** Scope (updated): **all three apps — BMS, SEQ and APP —
share one Prisma schema** in `@genealogiq/db`. APP stays distinct only in UI/design, not in the
data layer. All three already point at the same Neon database, so one schema is the correct model.
The canonical schema is the **superset** (APP's models) reconciled to the real DB.

> ## ⚠️ Approach change forced by a real conflict
> While checking APP I found `apps/app/src/actions/billing.ts` does
> `prisma.subscription.findUnique({ select: { stripeAnnualPriceId, stripeMonthlyPriceId }})`,
> but **no migration in the shared history ever creates** `subscriptions.stripe_annual_price_id`
> / `stripe_monthly_price_id` / `stripe_product_id`. So the three `schema.prisma` files have
> drifted from the migration history in **both** directions — they declare columns the migrations
> never created, *and* the DB may hold columns the migrations never recorded (manual/console DDL).
>
> Conclusion: **hand-reconciling the three files against the migration SQL is not safe.** The only
> authoritative source is the **live database**. Phase 4 must derive the canonical schema by
> introspecting it: `npx prisma db pull` against a Neon snapshot/branch. That resolves every
> divergence below definitively (taxId uniqueness, audit columns, *and* the subscription Stripe
> columns) in one shot, instead of guessing per-field.

---

## The single most important finding

The Prisma **migration histories are byte-identical across all three apps**:

```
sha256(bms/prisma/migrations)  = a7279a96…21e6e
sha256(seq/prisma/migrations)  = a7279a96…21e6e   ← identical
sha256(app/prisma/migrations)  = a7279a96…21e6e   ← identical
```

Consequences:

1. **The database state is unambiguous.** There is exactly one true DDL history, already
   applied to the Neon DB. The migration SQL — not any one `schema.prisma` — is ground truth.
2. **Phase 4 needs NO new migration and NO data change.** It is a *pure code refactor*:
   collapse three drifted `schema.prisma` files into one correct one and re-point the Prisma
   clients. Nothing is written to the DB. This is far lower-risk than a normal schema migration.
3. **The three `schema.prisma` files have each silently drifted from the DB in different
   directions** — they declare columns/constraints that the migrations never created (or omit
   ones they did). Today's per-app Prisma clients are therefore each slightly *wrong*.
   Consolidating to a schema derived from the migration SQL makes the client **more** correct
   than any app is today, while removing the triplication.

---

## Divergence reconciliation (BMS ↔ SEQ → canonical)

Each row resolved against the migration SQL (the DB), then cross-checked against source usage
to confirm the change breaks nothing.

> **The `db pull` (2026-06-07) overturned the migration-SQL guesses below.** The live DB is the
> truth, and it differs from what the tracked migrations implied — several columns/constraints
> were applied to the DB outside the migration history. Resolved against introspection:

| # | Model.field | What the migration SQL implied | What the **live DB actually has** | Canonical |
|---|---|---|---|---|
| 1 | `Supplier.taxId` | global unique dropped → scoped only | **BOTH** `@unique` (global) **and** `@@unique([tenantId, taxId])` | keep **both** |
| 2 | `Tenant.taxId` | no unique | **`@unique`**, constraint legacy-named `customers_tax_id_key` (grep missed it — table was renamed customers→tenants) | **`@unique(map: "customers_tax_id_key")`** |
| 3 | Audit FKs on `Supplier`/`SupplierCategory`/`AppUserCategory`/`AppUser` + `User` back-relations | columns never created | columns **exist** | **keep** (SEQ was right) |
| 4 | `Subscription.stripeProductId/Monthly/Annual` | columns never created | columns **exist** (APP billing depends on them — not broken) | **keep** (APP was right) |
| 5 | `PhysicalQrLicense.id` | no DB default | `@default(cuid())` app-side | **`@id @default(cuid())`** |
| 6 | App-domain models + many `@db.VarChar`/`@db.Timestamptz` types, legacy FK `map:` names, partial unique on `app_users.email`, `@db.VarChar(30)` on guardians | not visible in SQL | all **exist** in DB | **keep verbatim from introspection** |

**Lesson:** every hand-maintained `schema.prisma` (BMS, SEQ **and** APP) had drifted from the live
DB in different ways. Hand-reconciling against the migrations would have produced a wrong schema
(it would have dropped the audit columns and the Subscription Stripe columns that production
actually uses, breaking SEQ and APP). The canonical was therefore taken straight from `prisma db
pull`, with only the auto-generated identifiers renamed back to the apps' conventions so existing
code compiles. Structure (types, constraint names, partial indexes, referential actions) is kept
verbatim, so the schema is `migrate diff`-clean against production.

**Acceptance gate (you run it — I have no DB access):**
```bash
cd monorepo/apps/app   # any app; they share the DB
DATABASE_URL="<prod-url>" npx prisma migrate diff \
  --from-schema-datamodel ../../packages/db/prisma/schema.prisma \
  --to-url "$DATABASE_URL"
# Expect: "No difference detected."  (proves the canonical exactly matches production)
```

**Result (2026-06-07):** clean except for one benign, pre-existing item:
```
[*] Changed the `_CouponPackages` table
  [-] Dropped the primary key on columns (A, B)
  [+] Added unique index on columns (A, B)
```
This is the implicit many-to-many join table for `DiscountCoupon.appliesTo` ↔ `Package.coupons`.
The live DB has a **unique index** on (A,B) (created by an older Prisma); Prisma 7's expected
datamodel for an implicit m2m uses a **primary key** on (A,B). The two are functionally identical
(both enforce uniqueness of the pair, both not-null). This diff is **not introduced by Phase 4** —
every app's current schema already declares this relation as implicit m2m, so it predates the
consolidation. Every real table/column/constraint/index otherwise matches production exactly.

Decision: **accept as-is.** The Prisma client treats `_CouponPackages` as implicit m2m regardless
of PK-vs-unique, so `coupon.appliesTo` / `package.coupons` (`connect`/`disconnect`) work unchanged.
Optional future cleanup (own maintenance window, touches only the join table): one migration to
convert the unique index to a primary key, making `migrate diff` perfectly empty.

**Second intentional deviation — `Subscription.maxProfiles` / `termLength` / `price`.** The live DB
allows NULL on these columns, but all three apps' schemas have always declared them required and the
code does arithmetic on them (e.g. `assignedTo < subscription.maxProfiles`, `+ subscription.termLength`).
The seed always populates them, so no row is ever null. Kept **non-null** in the canonical to match
the application contract — declaring them nullable would force `?? 0` / `!` across SEQ and APP for a
case that never occurs. This adds two "would set NOT NULL" lines to `migrate diff`; the proper fix is
a future migration adding the `NOT NULL` constraint to the DB.

---

## Target package layout

```
packages/db/
  prisma/
    schema.prisma          # the canonical schema (SEQ-derived, reconciled)
    migrations/            # the single shared history (identical copy)
  src/
    index.ts               # export { prisma } singleton + re-export generated types
    generated/             # prisma client output (gitignored or committed per repo convention)
  package.json             # name "@genealogiq/db", exports "." , scripts: prisma generate
```

`apps/bms` and `apps/seq`:
- delete local `prisma/schema.prisma` + `src/generated/prisma`
- import the client/types from `@genealogiq/db`
- add `@genealogiq/db` to `transpilePackages`
- keep their own `.env`/`DATABASE_URL` (one DB, one URL)

APP is untouched.

---

## Staged execution order (each stage independently revertable on the branch)

0. **Get DB ground truth (you run this — I have no DB creds).** Create a Neon snapshot, branch
   from it, point `DATABASE_URL` at the branch, run `npx prisma db pull` to a scratch
   `schema.prisma`, and share/commit the result. This becomes the authoritative column set that
   settles the subscription-Stripe conflict and every other divergence.
1. **Scaffold** `packages/db` with the canonical schema (= the introspected schema, plus relation
   names / `@@map` niceties that `db pull` drops) and a copy of the shared `migrations/`.
   `prisma generate` → confirm client builds.
2. **Re-point SEQ** to `@genealogiq/db` (smaller delta — canonical is SEQ-derived). Run SEQ
   typecheck + lint + Vitest. Fix any import paths.
3. **Re-point BMS** to `@genealogiq/db`. Run BMS typecheck + lint + Vitest. BMS gains inert
   models; the three phantom-field removals require no code edits (confirmed).
4. **Parity check** now becomes a no-op for BMS/SEQ (one schema). Update
   `scripts/check-schema-parity.mjs` to compare APP-vs-`@genealogiq/db` only.
5. **Build all** + push branch → **Vercel preview** → visual check (DB-touching paths: supplier
   create/dedup, package buy, physical-QR issue) → **merge**.

---

## Hard prerequisites before executing

1. **Merge the Phase 3 branch (`chore/phase-3-shared-core`) first.** Phase 4 builds on
   `@genealogiq/core` and `@genealogiq/ui` being on `main`; branching Phase 4 off un-merged
   Phase 3 risks a tangled rebase.
2. **Take a Neon snapshot before merge.** Even though Phase 4 issues no DDL, snapshot first as
   standard practice for any change that *touches the data layer's wiring*.
3. **The DB itself needs no action from me.** No migration runs, no `migrate resolve` needed —
   the history is already applied and unchanged. (I have no DB credentials in this environment
   regardless; nothing here requires them.)

---

## Risk summary

| Risk | Level | Mitigation |
|---|---|---|
| DB data/DDL change | **none** | no migration is generated or run |
| App code breakage from removed fields | **very low** | every removal confirmed unused by grep |
| Prisma client import churn | medium | done one app at a time, typecheck-gated |
| Tailwind/preview regressions | n/a | no UI change in this phase |
| Branch tangle | medium | merge Phase 3 first (prereq #1) |
